package sceneengine

import (
	"bytes"
	"fmt"
	"sync"
)

const maxBrowserLogBytes = 8 << 10

type browserLog struct {
	mu     sync.Mutex
	buffer []byte
}

func (l *browserLog) Write(data []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.buffer = append(l.buffer, data...)
	if len(l.buffer) > maxBrowserLogBytes {
		l.buffer = bytes.Clone(l.buffer[len(l.buffer)-maxBrowserLogBytes:])
	}
	return len(data), nil
}

func (l *browserLog) wrap(err error) error {
	if l == nil || err == nil {
		return err
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.buffer) == 0 {
		return err
	}
	return fmt.Errorf("%w\nChromium diagnostics:\n%s", err, l.buffer)
}
