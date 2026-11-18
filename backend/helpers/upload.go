package helpers

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const (
	UploadDir    = "storage/uploads"
	MaxImageSize = 2 << 20
)

var ErrInvalidImage = errors.New("Gambar harus jpg, jpeg, png, atau webp dengan ukuran maksimal 2 MB")

var (
	allowedImageExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
	imageMIMEExt    = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
)

// SaveImage validates extension, sniffed content type and size, then stores the file under a random name.
// It returns the path relative to UploadDir, e.g. "settings/3f9c....png".
func SaveImage(fh *multipart.FileHeader, subdir string) (string, error) {
	if fh.Size > MaxImageSize || !allowedImageExt[strings.ToLower(filepath.Ext(fh.Filename))] {
		return "", ErrInvalidImage
	}
	src, err := fh.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	head := make([]byte, 512)
	n, _ := io.ReadFull(src, head)
	ext, ok := imageMIMEExt[http.DetectContentType(head[:n])]
	if !ok {
		return "", ErrInvalidImage
	}
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return "", err
	}

	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	name := hex.EncodeToString(random) + ext
	dir := filepath.Join(UploadDir, subdir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", err
	}
	dstPath := filepath.Join(dir, name)
	dst, err := os.OpenFile(dstPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		return "", err
	}
	written, err := io.Copy(dst, io.LimitReader(src, MaxImageSize+1))
	closeErr := dst.Close()
	if err == nil && written > MaxImageSize {
		err = ErrInvalidImage
	}
	if err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(dstPath)
		return "", err
	}
	return subdir + "/" + name, nil
}

// RemoveUpload deletes a file previously returned by SaveImage. Paths escaping UploadDir are ignored.
func RemoveUpload(rel string) {
	clean := filepath.Clean(rel)
	if rel == "" || filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
		return
	}
	_ = os.Remove(filepath.Join(UploadDir, clean))
}
