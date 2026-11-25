import ExcelJS from 'exceljs'
import mammoth from 'mammoth/mammoth.browser.js'
import { rawFromExcelRow, parseWordText, normalizeQuestion } from './questionParse.js'

const check = raws => raws.map((raw, i) => ({ no: i + 1, ...normalizeQuestion(raw) }))

const cellText = v => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('')
    if (v.result !== undefined) return String(v.result ?? '')
    if (v.text !== undefined) return String(v.text)
    return ''
  }
  return String(v)
}

// Baca satu lembar Excel (.xlsx) menjadi daftar objek {namaKolom: teks}
async function readSheet(file, preferredName) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.getWorksheet(preferredName) || wb.worksheets[0]
  const header = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { header[i] = cellText(c.value).trim() })
  const rows = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const obj = {}
    header.forEach((h, i) => { if (h) obj[h] = cellText(row.getCell(i).value).trim() })
    rows.push(obj)
  })
  return rows
}

export async function readExcelQuestions(file) {
  const rows = await readSheet(file, 'Soal')
  return check(rows.map(rawFromExcelRow).filter(r => String(r.soal).trim() || String(r.tipe).trim()))
}

export async function readWordQuestions(file) {
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return check(parseWordText(value))
}

export async function readStudentRows(file) {
  const rows = await readSheet(file, 'Mahasiswa')
  return rows.map((row, i) => {
    const r = {}
    Object.keys(row).forEach(k => { r[k.trim().toLowerCase()] = row[k] })
    return { no: i + 1, nim: r.nim || '', nama: r.nama || '', email: r.email || '' }
  }).filter(r => r.nim || r.nama || r.email)
}

export async function downloadExcel(rows, filename, sheetName = 'Data') {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  const cols = rows.length ? Object.keys(rows[0]) : []
  ws.columns = cols.map(c => ({ header: c, key: c, width: 26 }))
  ws.addRows(rows)
  ws.getRow(1).font = { bold: true }
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
