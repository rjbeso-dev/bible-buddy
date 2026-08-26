import { describe, it, expect } from 'vitest'
import { stripPastedTextColor } from './RichTextEditor'

describe('stripPastedTextColor', () => {
  it('removes an inline color from pasted style attributes', () => {
    const html = '<p style="color: rgb(0, 0, 0); font-weight: 700;">Context</p>'
    const result = stripPastedTextColor(html)
    expect(result).not.toContain('color')
    expect(result).toContain('font-weight: 700')
  })

  it('removes -webkit-text-fill-color specifically', () => {
    const html = '<span style="-webkit-text-fill-color: rgb(0, 0, 0); font-size: 17px;">Context</span>'
    const result = stripPastedTextColor(html)
    expect(result).not.toContain('webkit-text-fill-color')
    expect(result).toContain('font-size: 17px')
  })

  it('removes the color attribute from a <font> tag but keeps face/size', () => {
    const html = '<font color="#1a1a1a" face="Arial" size="3">Context</font>'
    const result = stripPastedTextColor(html)
    expect(result).not.toContain('color=')
    expect(result).toContain('face="Arial"')
    expect(result).toContain('size="3"')
  })

  it('leaves structure, bold, and italic untouched when there is no color to strip', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em> text.</p>'
    expect(stripPastedTextColor(html)).toBe(html)
  })

  it('leaves background-color alone -- only foreground color is in scope', () => {
    const html = '<span style="background-color: rgb(253, 232, 138); color: rgb(0, 0, 0);">hi</span>'
    const result = stripPastedTextColor(html)
    expect(result).toContain('background-color: rgb(253, 232, 138)')
    expect(result).not.toMatch(/[^-]color: rgb\(0, 0, 0\)/)
  })
})
