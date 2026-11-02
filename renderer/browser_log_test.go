package sceneengine

import (
	"errors"
	"strings"
	"sync"
	"testing"
)

func TestBrowserLogRetainsBoundedFailureDetails(t *testing.T) {
	var log browserLog
	data := []byte(strings.Repeat("x", maxBrowserLogBytes) + "\nNo space left on device")
	written, err := log.Write(data)
	if err != nil || written != len(data) {
		t.Fatalf("write browser output: %d, %v", written, err)
	}
	if len(log.buffer) != maxBrowserLogBytes {
		t.Fatalf("browser log has %d bytes", len(log.buffer))
	}
	cause := errors.New("capture frame 1405 failed")
	failure := log.wrap(cause)
	if !errors.Is(failure, cause) || !strings.HasSuffix(failure.Error(), "No space left on device") {
		t.Fatalf("lost capture failure or browser diagnostic: %v", failure)
	}
}

func TestBrowserLogWithoutOutputPreservesOriginalError(t *testing.T) {
	cause := errors.New("capture failed")
	for _, log := range []*browserLog{nil, {}} {
		if log.wrap(cause) != cause {
			t.Fatal("empty browser output changed the original error")
		}
	}
}

func TestBrowserLogSupportsConcurrentOutputAndFailures(t *testing.T) {
	var log browserLog
	var writers sync.WaitGroup
	for range 4 {
		writers.Go(func() {
			for range 100 {
				log.Write([]byte("browser diagnostic\n"))
				log.wrap(errors.New("capture failed"))
			}
		})
	}
	writers.Wait()
}
