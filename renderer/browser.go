package sceneengine

import (
	"context"
	"fmt"
	"os/exec"
	"sync"
	"time"

	"github.com/chromedp/chromedp"
)

const (
	defaultConcurrency  = 2
	maxConcurrency      = 16
	defaultFrameTimeout = 30 * time.Second
)

// Renderer owns one Chromium process reused across sequential render jobs.
// Each active frame has an exclusive tab; concurrent Render calls are rejected.
type Renderer struct {
	browser         context.Context
	cancelBrowser   context.CancelFunc
	cancelAllocator context.CancelFunc
	options         Options
	lease           chan struct{}
	closeOnce       sync.Once
	browserLog      *browserLog
}

// New starts a pinned browser whose lifetime is owned by ctx or Close.
func New(ctx context.Context, options Options) (*Renderer, error) {
	options, err := normalizeOptions(options)
	if err != nil {
		return nil, err
	}
	diagnostics := &browserLog{}
	flags := append([]chromedp.ExecAllocatorOption{}, chromedp.DefaultExecAllocatorOptions[:]...)
	flags = append(flags,
		chromedp.CombinedOutput(diagnostics),
		chromedp.ExecPath(options.BrowserExecutable),
		chromedp.Flag("disable-background-timer-throttling", true),
		chromedp.Flag("disable-renderer-backgrounding", true),
		chromedp.Flag("disable-backgrounding-occluded-windows", true),
		chromedp.Flag("force-color-profile", "srgb"),
		chromedp.Flag("hide-scrollbars", true),
		chromedp.Flag("mute-audio", true),
	)
	if options.NoSandbox {
		flags = append(flags, chromedp.NoSandbox)
	}
	if options.EnableGPU {
		flags = append(flags, chromedp.Flag("disable-gpu", false), chromedp.Flag("enable-gpu", true))
	}
	allocator, cancelAllocator := chromedp.NewExecAllocator(ctx, flags...)
	browser, cancelBrowser := chromedp.NewContext(allocator)
	renderer := &Renderer{browser: browser, cancelBrowser: cancelBrowser, cancelAllocator: cancelAllocator, options: options, lease: make(chan struct{}, 1), browserLog: diagnostics}
	startupTimeout := time.AfterFunc(options.FrameTimeout, cancelBrowser)
	defer startupTimeout.Stop()
	if err := chromedp.Do(browser); err != nil {
		renderer.Close()
		return nil, diagnostics.wrap(fmt.Errorf("start Chromium: %w", err))
	}
	return renderer, nil
}

func normalizeOptions(options Options) (Options, error) {
	if options.BrowserExecutable == "" {
		return options, fmt.Errorf("BrowserExecutable is required; use a pinned Chrome Headless Shell binary")
	}
	if options.FFmpegExecutable == "" {
		options.FFmpegExecutable = "ffmpeg"
	}
	ffmpeg, err := exec.LookPath(options.FFmpegExecutable)
	if err != nil {
		return options, fmt.Errorf("locate FFmpeg: %w", err)
	}
	options.FFmpegExecutable = ffmpeg
	if options.X264Preset == "" {
		options.X264Preset = "medium"
	}
	switch options.X264Preset {
	case "ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow":
	default:
		return options, fmt.Errorf("invalid x264 preset")
	}
	if options.EncoderThreads < 0 || options.EncoderThreads > 32 {
		return options, fmt.Errorf("encoder threads must be between 0 (automatic) and 32")
	}
	if options.Concurrency == 0 {
		options.Concurrency = defaultConcurrency
	}
	if options.Concurrency < 1 || options.Concurrency > maxConcurrency {
		return options, fmt.Errorf("concurrency must be between 1 and %d", maxConcurrency)
	}
	if options.FrameTimeout == 0 {
		options.FrameTimeout = defaultFrameTimeout
	}
	if options.FrameTimeout < 0 {
		return options, fmt.Errorf("frame timeout must be positive")
	}
	for _, origin := range options.AllowedOrigins {
		if _, err := parseOrigin(origin); err != nil {
			return options, fmt.Errorf("allowed origin %q: %w", origin, err)
		}
	}
	return options, nil
}

// Close cancels active jobs and releases the browser process; it is idempotent.
func (r *Renderer) Close() {
	r.closeOnce.Do(func() {
		r.cancelBrowser()
		r.cancelAllocator()
	})
}
