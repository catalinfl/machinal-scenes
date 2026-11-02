package sceneengine

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"sync/atomic"
	"testing"
	"time"
)

func TestStreamFramesOrdersConcurrentResults(t *testing.T) {
	capture := func(ctx context.Context, index int) ([]byte, error) {
		if index%3 == 0 {
			time.Sleep(5 * time.Millisecond)
		}
		return []byte(fmt.Sprintf("%02d|", index)), nil
	}
	var output bytes.Buffer
	var progress []int
	err := streamFrames(context.Background(), 30, []captureFunc{capture, capture, capture}, &output, func(written int) { progress = append(progress, written) })
	if err != nil {
		t.Fatal(err)
	}
	var expected bytes.Buffer
	for index := 0; index < 30; index++ {
		fmt.Fprintf(&expected, "%02d|", index)
	}
	if output.String() != expected.String() {
		t.Fatalf("frames are out of order: %s", output.String())
	}
	if len(progress) != 30 || progress[29] != 30 {
		t.Fatalf("invalid progress: %v", progress)
	}
}

func TestStreamFramesBoundsReorderingWindow(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	release := make(chan struct{})
	var started atomic.Int64
	capture := func(ctx context.Context, index int) ([]byte, error) {
		started.Add(1)
		if index == 0 {
			select {
			case <-release:
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		return []byte{byte(index)}, nil
	}
	done := make(chan error, 1)
	go func() { done <- streamFrames(ctx, 100, []captureFunc{capture, capture}, io.Discard, nil) }()
	deadline := time.Now().Add(time.Second)
	for started.Load() < 4 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(15 * time.Millisecond)
	if value := started.Load(); value != 4 {
		t.Errorf("expected window of four frames, got %d", value)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestStreamFramesCancelsOtherWorkersOnFailure(t *testing.T) {
	expected := errors.New("broken frame")
	blocked := make(chan struct{})
	capture := func(ctx context.Context, index int) ([]byte, error) {
		if index == 0 {
			<-blocked
			return nil, expected
		}
		close(blocked)
		<-ctx.Done()
		return nil, ctx.Err()
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := streamFrames(ctx, 10, []captureFunc{capture, capture}, io.Discard, nil); !errors.Is(err, expected) {
		t.Fatalf("expected capture failure, got %v", err)
	}
}

func TestStreamFramesHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	capture := func(ctx context.Context, _ int) ([]byte, error) { cancel(); <-ctx.Done(); return nil, ctx.Err() }
	if err := streamFrames(ctx, 10, []captureFunc{capture}, io.Discard, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation, got %v", err)
	}
}

type shortWriter struct{}

func (shortWriter) Write(buffer []byte) (int, error) { return len(buffer) - 1, nil }

func TestStreamFramesRejectsTruncatedWrites(t *testing.T) {
	capture := func(context.Context, int) ([]byte, error) { return []byte("frame"), nil }
	err := streamFrames(context.Background(), 2, []captureFunc{capture}, shortWriter{}, nil)
	if !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("expected a truncated-write error, got %v", err)
	}
}
