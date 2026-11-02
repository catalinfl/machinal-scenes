package sceneengine

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"time"
)

// Render publishes an asset only after its complete video/audio encoding succeeds.
func (r *Renderer) Render(ctx context.Context, request Request, output string) (result Result, renderErr error) {
	if err := request.Validate(); err != nil {
		return Result{}, err
	}
	codec, err := outputCodec(output, request.Config.Transparent)
	if err != nil {
		return Result{}, err
	}
	select {
	case r.lease <- struct{}{}:
		defer func() { <-r.lease }()
	default:
		return Result{}, fmt.Errorf("renderer is busy")
	}
	defer func() { renderErr = r.browserLog.wrap(renderErr) }()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	stop := context.AfterFunc(r.browser, cancel)
	defer stop()
	started := time.Now()
	staged, err := stageOutput(output)
	if err != nil {
		return Result{}, err
	}
	defer os.Remove(staged)
	workers, err := r.loadWorkers(ctx, request)
	if err != nil {
		return Result{}, err
	}
	defer closeWorkers(workers)
	metrics := RenderMetrics{Workers: len(workers), Load: time.Since(started)}
	process, err := startEncoder(ctx, r.options, request, codec, staged)
	if err != nil {
		return Result{}, err
	}
	captures := make([]captureFunc, len(workers))
	for index, worker := range workers {
		captures[index] = worker.capture
	}
	streamStarted := time.Now()
	err = streamFrames(ctx, request.Config.DurationInFrames, captures, process.input, func(written int) {
		if r.options.Progress != nil {
			r.options.Progress(Progress{WrittenFrames: written, TotalFrames: request.Config.DurationInFrames, Elapsed: time.Since(started)})
		}
	})
	metrics.CaptureAndEncode = time.Since(streamStarted)
	if err != nil {
		cancel()
		encodingErr := process.finish()
		if encodingErr != nil {
			return Result{}, fmt.Errorf("%w; encoder: %v", err, encodingErr)
		}
		return Result{}, err
	}
	drainStarted := time.Now()
	if err := process.finish(); err != nil {
		return Result{}, err
	}
	metrics.EncoderDrain = time.Since(drainStarted)
	for _, worker := range workers {
		metrics.SeekWorkerTime += worker.seekTime
		metrics.CaptureWorkerTime += worker.captureTime
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	return publishOutput(staged, output, request, workers[0].manifest, codec, time.Since(started), metrics)
}

func outputCodec(output string, transparent bool) (Codec, error) {
	switch strings.ToLower(filepath.Ext(output)) {
	case ".mp4":
		if transparent {
			return "", fmt.Errorf("transparent output requires .webm (VP9), not MP4")
		}
		return H264, nil
	case ".webm":
		return VP9, nil
	default:
		return "", fmt.Errorf("output extension must be .mp4 or .webm")
	}
}

func (r *Renderer) loadWorkers(ctx context.Context, request Request) ([]*frameWorker, error) {
	count := min(r.options.Concurrency, request.Config.DurationInFrames)
	workers := make([]*frameWorker, count)
	loadCtx, cancel := context.WithCancelCause(ctx)
	var loading sync.WaitGroup
	for index := range count {
		loading.Go(func() {
			worker, err := r.newWorker(loadCtx, request)
			if err != nil {
				cancel(fmt.Errorf("initialize worker %d: %w", index, err))
				return
			}
			workers[index] = worker
		})
	}
	loading.Wait()
	if err := context.Cause(loadCtx); err != nil {
		closeWorkers(workers)
		cancel(err)
		return nil, err
	}
	for _, worker := range workers[1:] {
		if !reflect.DeepEqual(worker.manifest, workers[0].manifest) {
			closeWorkers(workers)
			cancel(context.Canceled)
			return nil, fmt.Errorf("scene manifests differ between workers")
		}
	}
	// Keep successful tabs alive until the job releases its workers.
	closeFirst := workers[0].close
	workers[0].close = func() {
		cancel(context.Canceled)
		closeFirst()
	}
	return workers, nil
}

func closeWorkers(workers []*frameWorker) {
	for _, worker := range workers {
		if worker != nil {
			worker.close()
		}
	}
}
