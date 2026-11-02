package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	sceneengine "github.com/catalinfl/machinal-scenes/renderer"
)

var version = "dev"

type cliOptions struct {
	printVersion   bool
	requestFile    string
	output         string
	serveDirectory string
	renderer       sceneengine.Options
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	options := parseFlags()
	if err := run(ctx, options, os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func parseFlags() cliOptions {
	var options cliOptions
	var allowedOrigins string
	flag.BoolVar(&options.printVersion, "version", false, "print the renderer version")
	flag.StringVar(&options.requestFile, "request", "", "JSON/YAML job file (required)")
	flag.StringVar(&options.output, "output", "", "new .mp4 or .webm output file (required)")
	flag.StringVar(&options.serveDirectory, "serve", "", "serve a built scene directory on an ephemeral loopback port")
	flag.StringVar(&options.renderer.BrowserExecutable, "browser", os.Getenv("SCENE_BROWSER"), "pinned Chrome Headless Shell executable")
	flag.StringVar(&options.renderer.FFmpegExecutable, "ffmpeg", "ffmpeg", "FFmpeg executable")
	flag.IntVar(&options.renderer.Concurrency, "workers", 2, "concurrent pages (1–16)")
	flag.IntVar(&options.renderer.EncoderThreads, "encoder-threads", 0, "encoder threads (0 = automatic, at most 32)")
	flag.StringVar(&options.renderer.X264Preset, "x264-preset", "medium", "x264 speed/compression preset (does not select quality)")
	flag.BoolVar(&options.renderer.Lossless, "lossless", false, "lossless intermediate encoding; MP4 retains RGB, WebM retains alpha")
	flag.BoolVar(&options.renderer.EnableGPU, "gpu", false, "allow hardware GPU rendering (requires working device access)")
	flag.DurationVar(&options.renderer.FrameTimeout, "frame-timeout", 30*time.Second, "timeout for page preparation or one frame")
	flag.BoolVar(&options.renderer.NoSandbox, "no-sandbox", false, "disable Chromium sandbox for an externally isolated container")
	flag.StringVar(&allowedOrigins, "allow-origins", "", "comma-separated additional resource origins")
	flag.Parse()
	if allowedOrigins != "" {
		for _, origin := range strings.Split(allowedOrigins, ",") {
			options.renderer.AllowedOrigins = append(options.renderer.AllowedOrigins, strings.TrimSpace(origin))
		}
	}
	return options
}

func run(ctx context.Context, options cliOptions, stdout, stderr io.Writer) error {
	if options.printVersion {
		if _, err := fmt.Fprintf(stdout, "machinal-scene-render %s\n", version); err != nil {
			return fmt.Errorf("write renderer version: %w", err)
		}
		return nil
	}
	if options.requestFile == "" || options.output == "" {
		return fmt.Errorf("-request and -output are required")
	}
	request, err := loadRequest(options.requestFile)
	if err != nil {
		return err
	}
	if options.serveDirectory != "" {
		resolvedURL, closeServer, err := serveScene(options.serveDirectory, request.URL)
		if err != nil {
			return err
		}
		defer closeServer()
		request.URL = resolvedURL
	}
	options.renderer.Progress = func(progress sceneengine.Progress) {
		if progress.WrittenFrames == 1 || progress.WrittenFrames%30 == 0 || progress.WrittenFrames == progress.TotalFrames {
			fmt.Fprintf(stderr, "frames %d/%d · %s\n", progress.WrittenFrames, progress.TotalFrames, progress.Elapsed.Round(time.Millisecond))
		}
	}
	renderer, err := sceneengine.New(ctx, options.renderer)
	if err != nil {
		return err
	}
	defer renderer.Close()
	result, err := renderer.Render(ctx, request, options.output)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(stdout).Encode(result); err != nil {
		return fmt.Errorf("write result JSON: %w", err)
	}
	return nil
}

func loadRequest(path string) (sceneengine.Request, error) {
	file, err := os.Open(path)
	if err != nil {
		return sceneengine.Request{}, fmt.Errorf("open request: %w", err)
	}
	defer file.Close()
	request, err := sceneengine.DecodeRequest(file)
	if err != nil {
		return request, err
	}
	for index := range request.Audio {
		source := &request.Audio[index]
		if !filepath.IsAbs(source.File) {
			source.File = filepath.Join(filepath.Dir(path), source.File)
		}
		source.File, err = filepath.Abs(source.File)
		if err != nil {
			return request, fmt.Errorf("resolve audio[%d]: %w", index, err)
		}
	}
	return request, nil
}
