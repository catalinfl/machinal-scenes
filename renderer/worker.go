package sceneengine

import (
	"context"
	"fmt"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

type frameWorker struct {
	ctx         context.Context
	close       func()
	request     Request
	manifest    Manifest
	options     Options
	cancel      context.CancelFunc
	seekTime    time.Duration
	captureTime time.Duration
}

func (r *Renderer) newWorker(job context.Context, request Request) (*frameWorker, error) {
	tab, cancel := chromedp.NewContext(r.browser)
	stop := context.AfterFunc(job, cancel)
	worker := &frameWorker{ctx: tab, close: func() { stop(); cancel() }, cancel: cancel, request: request, options: r.options}
	// The first action owns the target's event loop, so it must use the tab's
	// lifetime context rather than the short-lived page preparation context.
	timeout := time.AfterFunc(r.options.FrameTimeout, cancel)
	err := chromedp.Do(tab)
	timeout.Stop()
	if err != nil {
		worker.close()
		return nil, fmt.Errorf("create worker tab: %w", err)
	}
	if err := worker.load(); err != nil {
		worker.close()
		return nil, err
	}
	return worker, nil
}

func (w *frameWorker) load() error {
	payload, err := w.request.browserPayload()
	if err != nil {
		return fmt.Errorf("serialize browser request: %w", err)
	}
	ctx, cancel := context.WithTimeout(w.ctx, w.options.FrameTimeout)
	defer cancel()
	err = chromedp.Do(ctx,
		chromedp.EmulateViewport(int64(w.request.Config.Width), int64(w.request.Config.Height)),
		chromedp.Func(func(ctx context.Context, target *chromedp.Target) error {
			if !w.request.Config.Transparent {
				return nil
			}
			// Explicit zero alpha is omitted by the generated protocol type.
			return target.Call(ctx, emulation.SetDefaultBackgroundColorOverride.Method, map[string]any{"color": map[string]any{"r": 0, "g": 0, "b": 0, "a": 0}}, nil)
		}),
		restrictNetwork(w.ctx, w.request.URL, w.options.AllowedOrigins, w.cancel),
		chromedp.Func(func(ctx context.Context, target *chromedp.Target) error {
			_, err := cdp.Call(ctx, target, page.AddScriptToEvaluateOnNewDocument, page.AddScriptToEvaluateOnNewDocumentParams{Source: "window.__sceneRequest = " + string(payload) + ";"})
			return err
		}),
		chromedp.Navigate(w.request.URL),
		chromedp.Poll[chromedp.Void]("Boolean(window.__scene || window.__sceneError)", chromedp.WithPollingTimeout(w.options.FrameTimeout)),
	)
	if err != nil {
		return fmt.Errorf("prepare scene page: %w", err)
	}
	w.manifest, err = chromedp.Run(ctx, chromedp.Evaluate[Manifest](`(async () => {
   if (window.__sceneError) throw new Error(window.__sceneError);
   if (window.__scene.version !== 1) throw new Error('Unsupported scene protocol');
   await window.__scene.ready();
   return window.__scene.manifest;
  })()`, chromedp.EvalAwaitPromise))
	if err != nil {
		return fmt.Errorf("load scene %q: %w", w.request.SceneID, err)
	}
	if w.manifest.Version != ProtocolVersion || w.manifest.SceneID != w.request.SceneID || w.manifest.Config != w.request.Config {
		return fmt.Errorf("scene manifest does not match the render request")
	}
	return nil
}

func (w *frameWorker) capture(job context.Context, frame int) ([]byte, error) {
	ctx, cancel := context.WithTimeout(w.ctx, w.options.FrameTimeout)
	defer cancel()
	stop := context.AfterFunc(job, cancel)
	defer stop()
	started := time.Now()
	err := chromedp.Do(ctx, chromedp.Evaluate[chromedp.Void](fmt.Sprintf("window.__scene.seek(%d)", frame), chromedp.EvalAwaitPromise))
	w.seekTime += time.Since(started)
	if err != nil {
		return nil, fmt.Errorf("seek frame %d: %w", frame, err)
	}
	started = time.Now()
	buffer, err := chromedp.Run(ctx, func(ctx context.Context, target *chromedp.Target) ([]byte, error) {
		beyondViewport, optimize := false, true
		params := page.CaptureScreenshotParams{Format: page.CaptureScreenshotFormatPng, CaptureBeyondViewport: &beyondViewport, OptimizeForSpeed: &optimize}
		result, err := cdp.Call(ctx, target, page.CaptureScreenshot, params)
		return result.Data, err
	})
	w.captureTime += time.Since(started)
	if err != nil {
		return nil, fmt.Errorf("capture frame %d: %w", frame, err)
	}
	return buffer, nil
}
