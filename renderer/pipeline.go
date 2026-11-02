package sceneengine

import (
	"context"
	"fmt"
	"io"
	"sync"
)

type captureFunc func(ctx context.Context, frame int) ([]byte, error)

type capturedFrame struct {
	index int
	bytes []byte
	err   error
}

// Credits are returned only after ordered writes, bounding out-of-order buffers
// even when an early frame is substantially slower than every later frame.
func streamFrames(ctx context.Context, count int, captures []captureFunc, writer io.Writer, progress func(int)) error {
	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	window := len(captures) * 2
	credits := make(chan struct{}, window)
	jobs := make(chan int)
	results := make(chan capturedFrame, len(captures))
	var workers sync.WaitGroup
	workers.Add(len(captures) + 1)
	go scheduleFrames(ctx, count, credits, jobs, &workers)
	for _, capture := range captures {
		go captureFrames(ctx, capture, jobs, results, &workers)
	}
	defer workers.Wait()
	defer cancel(context.Canceled)
	pending := make(map[int][]byte)
	next := 0
	for next < count {
		select {
		case <-ctx.Done():
			return context.Cause(ctx)
		case result := <-results:
			if result.err != nil {
				return result.err
			}
			pending[result.index] = result.bytes
			for {
				frame, available := pending[next]
				if !available {
					break
				}
				written, err := writer.Write(frame)
				if err != nil {
					return fmt.Errorf("write frame %d to encoder: %w", next, err)
				}
				if written != len(frame) {
					return fmt.Errorf("write frame %d to encoder: %w", next, io.ErrShortWrite)
				}
				delete(pending, next)
				<-credits
				next++
				if progress != nil {
					progress(next)
				}
			}
		}
	}
	return nil
}

func scheduleFrames(ctx context.Context, count int, credits chan<- struct{}, jobs chan<- int, workers *sync.WaitGroup) {
	defer workers.Done()
	defer close(jobs)
	for index := range count {
		select {
		case <-ctx.Done():
			return
		case credits <- struct{}{}:
		}
		select {
		case <-ctx.Done():
			return
		case jobs <- index:
		}
	}
}

func captureFrames(ctx context.Context, capture captureFunc, jobs <-chan int, results chan<- capturedFrame, workers *sync.WaitGroup) {
	defer workers.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case index, available := <-jobs:
			if !available {
				return
			}
			buffer, err := capture(ctx, index)
			select {
			case <-ctx.Done():
				return
			case results <- capturedFrame{index: index, bytes: buffer, err: err}:
			}
			if err != nil {
				return
			}
		}
	}
}
