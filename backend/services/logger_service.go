package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ServiceLogger writes one line per entry to storage/logs/<service>/<service>_YYYY-MM-DD.log, rotating daily.
type ServiceLogger struct {
	name string
	mu   sync.Mutex
	day  string
	file *os.File
}

var (
	loggers   = map[string]*ServiceLogger{}
	loggersMu sync.Mutex
)

func GetServiceLogger(name string) *ServiceLogger {
	loggersMu.Lock()
	defer loggersMu.Unlock()
	if l, ok := loggers[name]; ok {
		return l
	}
	l := &ServiceLogger{name: name}
	loggers[name] = l
	return l
}

func (l *ServiceLogger) Info(msg string, fields map[string]any)  { l.write("INFO", msg, fields) }
func (l *ServiceLogger) Warn(msg string, fields map[string]any)  { l.write("WARN", msg, fields) }
func (l *ServiceLogger) Error(msg string, fields map[string]any) { l.write("ERROR", msg, fields) }

func (l *ServiceLogger) write(level, msg string, fields map[string]any) {
	now := time.Now()
	extra := ""
	if len(fields) > 0 {
		if b, err := json.Marshal(fields); err == nil {
			extra = " " + string(b)
		}
	}
	line := fmt.Sprintf("%s [%s] %s%s\n", now.Format("2006-01-02 15:04:05"), level, msg, extra)

	l.mu.Lock()
	defer l.mu.Unlock()
	if err := l.rotate(now.Format("2006-01-02")); err != nil {
		fmt.Fprint(os.Stderr, line)
		return
	}
	_, _ = l.file.WriteString(line)
}

func (l *ServiceLogger) rotate(day string) error {
	if l.file != nil && l.day == day {
		return nil
	}
	dir := filepath.Join(logDir(), l.name)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(dir, l.name+"_"+day+".log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	if l.file != nil {
		_ = l.file.Close()
	}
	l.file, l.day = f, day
	return nil
}

func logDir() string {
	if d := os.Getenv("LOG_DIR"); d != "" {
		return d
	}
	return filepath.Join("storage", "logs")
}
