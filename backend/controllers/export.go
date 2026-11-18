package controllers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
)

// writeXLSX streams a one-sheet workbook with a bold header row.
func writeXLSX(ctx *gin.Context, filename string, headers []string, rows [][]any) error {
	f := excelize.NewFile()
	defer f.Close()
	const sheet = "Sheet1"
	style, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheet, cell, h)
		_ = f.SetCellStyle(sheet, cell, cell, style)
	}
	for r, row := range rows {
		for i, v := range row {
			cell, _ := excelize.CoordinatesToCellName(i+1, r+2)
			if err := f.SetCellValue(sheet, cell, v); err != nil {
				return err
			}
		}
	}
	ctx.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	ctx.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	ctx.Status(http.StatusOK)
	return f.Write(ctx.Writer)
}

// maxExportRows caps exports so a wide date range cannot exhaust memory.
const maxExportRows = 20000
