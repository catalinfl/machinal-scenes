package sceneengine

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
)

const maxEncoderLogBytes = 32 << 10

type encoder struct {
	command *exec.Cmd
	input   io.WriteCloser
	log     tailLog
}

type tailLog struct{ buffer []byte }

func (l *tailLog) Write(data []byte) (int, error) {
	count := len(data)
	l.buffer = append(l.buffer, data...)
	if len(l.buffer) > maxEncoderLogBytes {
		l.buffer = bytes.Clone(l.buffer[len(l.buffer)-maxEncoderLogBytes:])
	}
	return count, nil
}

func startEncoder(ctx context.Context, options Options, request Request, codec Codec, output string) (*encoder, error) {
	args := encoderArgs(request, codec, output, options)
	process := &encoder{command: exec.CommandContext(ctx, options.FFmpegExecutable, args...)}
	process.command.Stderr = &process.log
	input, err := process.command.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("open encoder stdin: %w", err)
	}
	process.input = input
	if err := process.command.Start(); err != nil {
		input.Close()
		return nil, fmt.Errorf("start FFmpeg: %w", err)
	}
	return process, nil
}

func (e *encoder) finish() error {
	closeErr := e.input.Close()
	if err := e.command.Wait(); err != nil {
		return fmt.Errorf("FFmpeg encoding failed: %w\n%s", err, string(e.log.buffer))
	}
	if closeErr != nil {
		return fmt.Errorf("close encoder input: %w", closeErr)
	}
	return nil
}

func encoderArgs(request Request, codec Codec, output string, options Options) []string {
	args := []string{"-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", decimal(request.Config.FPS), "-vcodec", "png", "-i", "pipe:0"}
	for _, audio := range request.Audio {
		args = append(args, "-i", audio.File)
	}
	if len(request.Audio) > 0 {
		args = append(args, "-filter_complex", audioFilter(request), "-map", "0:v:0", "-map", "[audio]")
		if codec == H264 {
			args = append(args, "-c:a", "aac", "-b:a", "192k")
		} else {
			args = append(args, "-c:a", "libopus", "-b:a", "192k")
		}
	} else {
		args = append(args, "-map", "0:v:0", "-an")
	}
	if codec == H264 {
		encoder, crf, pixelFormat := "libx264", "18", "yuv420p"
		if options.Lossless {
			encoder, crf, pixelFormat = "libx264rgb", "0", "rgb24"
		}
		args = append(args, "-c:v", encoder, "-preset", options.X264Preset, "-crf", crf, "-pix_fmt", pixelFormat, "-movflags", "+faststart")
	} else {
		pixelFormat := "yuv420p"
		if request.Config.Transparent {
			pixelFormat = "yuva420p"
		}
		crf := "30"
		if options.Lossless {
			crf = "0"
		}
		args = append(args, "-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0", "-pix_fmt", pixelFormat, "-auto-alt-ref", "0")
		if options.Lossless {
			args = append(args, "-lossless", "1", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1")
		}
	}
	if options.EncoderThreads > 0 {
		args = append(args, "-threads", strconv.Itoa(options.EncoderThreads))
	}
	return append(args, "-t", decimal(request.Config.Duration()), output)
}

func audioFilter(request Request) string {
	filters := make([]string, 0, len(request.Audio)+1)
	labels := make([]string, 0, len(request.Audio))
	for index, track := range request.Audio {
		volume := 1.0
		if track.Volume != nil {
			volume = *track.Volume
		}
		label := fmt.Sprintf("[a%d]", index)
		filters = append(filters, fmt.Sprintf("[%d:a:0]atrim=start=%s:duration=%s,asetpts=PTS-STARTPTS,volume=%s,adelay=%d:all=1%s", index+1, decimal(track.From), decimal(track.Duration), decimal(volume), int64(track.Start*1000+0.5), label))
		labels = append(labels, label)
	}
	filters = append(filters, fmt.Sprintf("%samix=inputs=%d:normalize=0,apad,atrim=duration=%s[audio]", strings.Join(labels, ""), len(labels), decimal(request.Config.Duration())))
	return strings.Join(filters, ";")
}

func decimal(value float64) string { return strconv.FormatFloat(value, 'f', -1, 64) }
