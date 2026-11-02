package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestVersionDoesNotRequireRenderingTools(t *testing.T) {
	var stdout, stderr bytes.Buffer
	err := run(context.Background(), cliOptions{printVersion: true}, &stdout, &stderr)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := stdout.String(), "machinal-scene-render "+version+"\n"; got != want {
		t.Fatalf("version output = %q, want %q", got, want)
	}
	if stderr.Len() != 0 {
		t.Fatalf("unexpected diagnostics: %s", stderr.String())
	}
}

func TestVersionReportsWriteFailure(t *testing.T) {
	err := run(context.Background(), cliOptions{printVersion: true}, failingWriter{}, io.Discard)
	if !errors.Is(err, io.ErrClosedPipe) || !strings.Contains(err.Error(), "write renderer version") {
		t.Fatalf("expected a wrapped write error, got %v", err)
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) {
	return 0, io.ErrClosedPipe
}
