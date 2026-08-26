import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Icon, type IconName } from '../ui/Icon'
import { sanitizeNoteHtml, plainTextToHtml } from '../../lib/sanitizeNoteHtml'
import { fileToDataUrl, ImageTooLargeError } from '../../lib/imageToDataUrl'

const MULTI_SELECT_CLASS = 'rte-block-selected'

/** Walk up from a click target to the nearest "line" — a list item, or
 * otherwise the nearest direct child of the editor body — for multi-select
 * mode's click-to-toggle granularity. */
function findSelectableBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  let el: Node | null = node
  while (el && el !== root) {
    if (el instanceof HTMLElement) {
      if (el.tagName === 'LI') return el
      if (el.parentElement === root) return el
    }
    el = el.parentNode
  }
  return null
}

/** Strip inline foreground-color styling from pasted HTML — external
 * sources (Google Docs, Word, etc.) bake in an explicit color that assumes
 * their own light/dark background, which then fights this app's theme once
 * pasted in here (fine in the theme the source assumed, unreadable in the
 * other — the same failure mode as the highlight/foreColor bug). Only
 * color is touched; every other bit of pasted formatting (bold, italic,
 * size, structure) is left exactly as copied. */
export function stripPastedTextColor(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll<HTMLElement>('*').forEach((el) => {
    el.style.removeProperty('color')
    el.style.removeProperty('-webkit-text-fill-color')
    if (el.tagName === 'FONT') el.removeAttribute('color')
  })
  return template.innerHTML
}

const FONT_STACKS: { label: string; value: string }[] = [
  { label: 'Serif', value: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif" },
  { label: 'Sans', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: 'Comfort', value: "'Atkinson Hyperlegible', Verdana, Tahoma, system-ui, sans-serif" },
  { label: 'Mono', value: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace" },
]

// execCommand('fontSize', ...) uses the legacy HTML 1-7 scale, not px.
const FONT_SIZES: { label: string; value: string }[] = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'X-Large', value: '6' },
]

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', hex: '#fde88a' },
  { name: 'Green', hex: '#bfe6b6' },
  { name: 'Blue', hex: '#b6d9f2' },
  { name: 'Pink', hex: '#f6c2d6' },
  { name: 'Orange', hex: '#f8cf9a' },
]

// Saturated enough to read as intentional text color against either theme's
// surface, unlike the pale HIGHLIGHT_COLORS above (which are backgrounds).
const FONT_COLORS = [
  { name: 'Red', hex: '#d64545' },
  { name: 'Orange', hex: '#d98736' },
  { name: 'Green', hex: '#4f9d5c' },
  { name: 'Blue', hex: '#4a7fd6' },
  { name: 'Purple', hex: '#8b5fc9' },
]

export interface RichTextEditorHandle {
  /** Insert HTML at the last known cursor position (works even if focus is
   * currently elsewhere, e.g. the user just clicked a verse in the side panel). */
  insertHtml: (html: string) => void
  focus: () => void
}

interface RichTextEditorProps {
  initialHtml: string
  placeholder?: string
  onChange: (html: string, plainText: string) => void
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ initialHtml, placeholder, onChange }, ref) {
    const editorRef = useRef<HTMLDivElement>(null)
    const savedRangeRef = useRef<Range | null>(null)
    const didInit = useRef(false)
    const [lastHighlight, setLastHighlight] = useState(HIGHLIGHT_COLORS[0].hex)
    const [lastFontColor, setLastFontColor] = useState(FONT_COLORS[0].hex)
    // Browsers (other than Firefox) only support one Selection range at a
    // time, so there's no native way to hold several disjoint text ranges
    // selected for formatting the way Word does. This tracks a set of whole
    // "lines" (list items, or paragraphs/headings/etc.) instead — coarser
    // than arbitrary text ranges, but it reaches the same end result and
    // works the same in every browser.
    const [multiSelectMode, setMultiSelectMode] = useState(false)
    const [multiSelectBlocks, setMultiSelectBlocks] = useState<HTMLElement[]>([])

    // Set the starting content once; after that the DOM is the source of
    // truth (re-setting innerHTML on every keystroke would fight the caret).
    useEffect(() => {
      if (didInit.current || !editorRef.current) return
      editorRef.current.innerHTML = sanitizeNoteHtml(initialHtml)
      didInit.current = true
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const saveRange = useCallback(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !editorRef.current) return
      const range = sel.getRangeAt(0)
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange()
      }
    }, [])

    // Popovers (the color pickers) live outside the contentEditable's DOM
    // subtree, so clicking a swatch would otherwise leave whatever the
    // browser's default click behavior did to the selection. Restoring the
    // range captured right when the picker opened puts it back exactly
    // where the user left it, the same trick insertHtml uses.
    const restoreSelection = useCallback(() => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      if (sel && savedRangeRef.current && el.contains(savedRangeRef.current.commonAncestorContainer)) {
        sel.removeAllRanges()
        sel.addRange(savedRangeRef.current)
      }
    }, [])

    const emitChange = useCallback(() => {
      const el = editorRef.current
      if (!el) return
      onChange(el.innerHTML, el.innerText)
    }, [onChange])

    // Runs `fn` once per selected "line" when multi-select mode has lines
    // held (temporarily pointing the native Selection at each one in turn,
    // since execCommand only ever acts on the current selection), or once
    // against the normal restored selection otherwise — every formatting
    // action funnels through here so multi-select is transparent to them.
    const applyToSelection = useCallback(
      (fn: () => void) => {
        const el = editorRef.current
        if (!el) return
        if (multiSelectMode && multiSelectBlocks.length > 0) {
          el.focus()
          const sel = window.getSelection()
          if (!sel) return
          for (const block of multiSelectBlocks) {
            const range = document.createRange()
            range.selectNodeContents(block)
            sel.removeAllRanges()
            sel.addRange(range)
            fn()
          }
        } else {
          restoreSelection()
          fn()
        }
        emitChange()
      },
      [multiSelectMode, multiSelectBlocks, restoreSelection, emitChange],
    )

    const exec = useCallback(
      (command: string, value?: string) => {
        applyToSelection(() => document.execCommand(command, false, value))
      },
      [applyToSelection],
    )

    const highlight = useCallback(
      (hex: string | null) => {
        const el = editorRef.current
        applyToSelection(() => {
          document.execCommand('hiliteColor', false, hex ?? 'transparent')
          if (hex) {
            document.execCommand('foreColor', false, '#1a1a1a')
          } else {
            // Removing a highlight must also undo the dark text color
            // forced on above when it was applied — otherwise the text is
            // left with a hardcoded near-black color that's unreadable
            // against a dark-mode background. Same reset as "default text
            // color" below: 'inherit' doesn't work here (resolves to fully
            // transparent), so resolve the theme's actual current color.
            const resetColor = el ? getComputedStyle(el).color : '#000'
            document.execCommand('foreColor', false, resetColor)
          }
        })
        if (hex) setLastHighlight(hex)
      },
      [applyToSelection],
    )

    const fontColor = useCallback(
      (hex: string | null) => {
        const el = editorRef.current
        applyToSelection(() => {
          // execCommand('foreColor', ...) doesn't understand cascade
          // keywords — passing 'inherit' was observed applying
          // rgba(0,0,0,0) (fully transparent, i.e. invisible text)
          // rather than resetting anything. Resolve the theme's actual
          // text color first so "default" sets a real, opaque value.
          const resetColor = hex ?? (el ? getComputedStyle(el).color : '#000')
          document.execCommand('foreColor', false, resetColor)
        })
        if (hex) setLastFontColor(hex)
      },
      [applyToSelection],
    )

    const toggleMultiSelect = useCallback(() => {
      setMultiSelectMode((wasOn) => {
        if (wasOn) {
          multiSelectBlocks.forEach((b) => b.classList.remove(MULTI_SELECT_CLASS))
          setMultiSelectBlocks([])
        }
        return !wasOn
      })
    }, [multiSelectBlocks])

    // Intercepted at mousedown (not click) so preventDefault actually stops
    // the browser from placing a caret or starting a native drag-selection —
    // by the time a click event fires, that's already happened.
    const handleEditorMouseDown = useCallback(
      (e: ReactMouseEvent<HTMLDivElement>) => {
        if (!multiSelectMode) return
        e.preventDefault()
        const root = editorRef.current
        if (!root) return
        const block = findSelectableBlock(e.target as Node, root)
        if (!block) return
        setMultiSelectBlocks((prev) => {
          if (prev.includes(block)) {
            block.classList.remove(MULTI_SELECT_CLASS)
            return prev.filter((b) => b !== block)
          }
          block.classList.add(MULTI_SELECT_CLASS)
          return [...prev, block]
        })
      },
      [multiSelectMode],
    )

    // Insert via the Range API rather than execCommand('insertHTML'): that
    // command re-merges the inserted markup with whatever inline formatting
    // is active at the caret (observed producing stray font-size/
    // background-color spans around an inserted verse quote), where
    // Range.insertNode() places exactly the nodes we built. Shared by the
    // exposed insertHtml handle (verse quotes from the Bible panel) and the
    // image-attach button below.
    const insertHtmlAtCursor = useCallback((html: string) => {
      const el = editorRef.current
      if (!el) return
      el.focus()

      let range: Range
      if (savedRangeRef.current && el.contains(savedRangeRef.current.commonAncestorContainer)) {
        range = savedRangeRef.current
      } else {
        range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
      }

      const template = document.createElement('template')
      template.innerHTML = sanitizeNoteHtml(html)
      const fragment = template.content
      const lastNode = fragment.lastChild

      range.deleteContents()
      range.insertNode(fragment)

      if (lastNode) {
        const sel = window.getSelection()
        const after = document.createRange()
        after.setStartAfter(lastNode)
        after.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(after)
        savedRangeRef.current = after.cloneRange()
      }

      emitChange()
    }, [emitChange])

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [imageError, setImageError] = useState<string | null>(null)
    const [imageBusy, setImageBusy] = useState(false)

    const onImageSelected = useCallback(
      async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = '' // allow picking the same file again later
        if (!file) return
        setImageError(null)
        setImageBusy(true)
        try {
          const dataUrl = await fileToDataUrl(file)
          insertHtmlAtCursor(`<img src="${dataUrl}" alt="${file.name.replace(/"/g, '')}">`)
        } catch (err) {
          setImageError(
            err instanceof ImageTooLargeError
              ? err.message
              : 'Could not attach that image.',
          )
        } finally {
          setImageBusy(false)
        }
      },
      [insertHtmlAtCursor],
    )

    useImperativeHandle(ref, () => ({
      insertHtml: insertHtmlAtCursor,
      focus: () => editorRef.current?.focus(),
    }))

    return (
      <div className="rich-editor">
        <div className="rich-editor-toolbar" role="toolbar" aria-label="Formatting">
          <ToolbarButton
            label={multiSelectMode ? 'Exit multi-select' : 'Select multiple lines'}
            icon="multi-select"
            isActive={multiSelectMode}
            onClick={toggleMultiSelect}
          />

          <span className="rich-editor-toolbar-divider" aria-hidden="true" />

          <ToolbarButton label="Bold" icon="bold" onClick={() => exec('bold')} />
          <ToolbarButton label="Italic" icon="italic" onClick={() => exec('italic')} />
          <ToolbarButton label="Underline" icon="underline" onClick={() => exec('underline')} />

          <span className="rich-editor-toolbar-divider" aria-hidden="true" />

          <select
            className="rich-editor-select"
            aria-label="Heading"
            defaultValue="P"
            onMouseDown={saveRange}
            onChange={(e) => {
              exec('formatBlock', e.target.value)
              e.target.value = 'P'
            }}
          >
            <option value="P">Paragraph</option>
            <option value="H1">Heading 1</option>
            <option value="H2">Heading 2</option>
            <option value="H3">Heading 3</option>
          </select>

          <ToolbarButton
            label="Bulleted list"
            icon="list"
            onClick={() => exec('insertUnorderedList')}
          />
          <ToolbarButton
            label="Numbered list"
            icon="list-ordered"
            onClick={() => exec('insertOrderedList')}
          />

          <span className="rich-editor-toolbar-divider" aria-hidden="true" />

          <ColorPickerButton
            label="Highlight color"
            icon="highlighter"
            colors={HIGHLIGHT_COLORS}
            activeColor={lastHighlight}
            noneLabel="Remove highlight"
            onOpen={saveRange}
            onPick={highlight}
          />
          <ColorPickerButton
            label="Text color"
            letter="A"
            colors={FONT_COLORS}
            activeColor={lastFontColor}
            noneLabel="Default text color"
            onOpen={saveRange}
            onPick={fontColor}
          />

          <span className="rich-editor-toolbar-divider" aria-hidden="true" />

          <ToolbarButton
            label={imageBusy ? 'Attaching image…' : 'Attach image'}
            icon="image"
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            disabled={imageBusy}
            onChange={onImageSelected}
          />

          <span className="rich-editor-toolbar-divider" aria-hidden="true" />

          <select
            className="rich-editor-select"
            aria-label="Font"
            defaultValue=""
            onMouseDown={saveRange}
            onChange={(e) => {
              if (e.target.value) exec('fontName', e.target.value)
              e.target.value = ''
            }}
          >
            <option value="" disabled>
              Font
            </option>
            {FONT_STACKS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <select
            className="rich-editor-select"
            aria-label="Font size"
            defaultValue=""
            onMouseDown={saveRange}
            onChange={(e) => {
              if (e.target.value) exec('fontSize', e.target.value)
              e.target.value = ''
            }}
          >
            <option value="" disabled>
              Size
            </option>
            {FONT_SIZES.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {imageError && (
          <p className="rich-editor-error" role="alert">
            {imageError}
            <button type="button" className="icon-button" onClick={() => setImageError(null)} aria-label="Dismiss">
              <Icon name="close" size={14} />
            </button>
          </p>
        )}

        {multiSelectMode && (
          <p className="rich-editor-multiselect-hint">
            Click lines to select or deselect them
            {multiSelectBlocks.length > 0 ? ` (${multiSelectBlocks.length} selected)` : ''} — then use the
            toolbar to format all of them at once.
          </p>
        )}

        <div
          ref={editorRef}
          className="rich-editor-body"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={emitChange}
          onBlur={saveRange}
          onKeyUp={saveRange}
          onMouseUp={saveRange}
          onMouseDown={handleEditorMouseDown}
          onKeyDown={(e) => {
            // Multi-select mode is for picking lines to format, not typing —
            // block ordinary text entry so a stray keystroke can't land in
            // whatever range happens to still be active from the last format.
            if (multiSelectMode && !(e.metaKey || e.ctrlKey) && e.key !== 'Escape') {
              e.preventDefault()
            }
          }}
          onPaste={(e) => {
            e.preventDefault()
            const html = e.clipboardData.getData('text/html')
            if (html) {
              insertHtmlAtCursor(stripPastedTextColor(html))
              return
            }
            const text = e.clipboardData.getData('text/plain')
            if (text) insertHtmlAtCursor(plainTextToHtml(text))
          }}
        />
      </div>
    )
  },
)

interface ToolbarButtonProps {
  label: string
  icon: IconName
  onClick: () => void
  isActive?: boolean
}

function ToolbarButton({ label, icon, onClick, isActive }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={'rich-editor-tool' + (isActive ? ' is-active' : '')}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

interface ColorPickerButtonProps {
  label: string
  icon?: IconName
  /** Shown instead of an icon for the text-color tool, Word-style. */
  letter?: string
  colors: { name: string; hex: string }[]
  activeColor: string
  noneLabel: string
  /** Called right as the popover opens, to capture the selection before
   * any click inside the popover has a chance to disturb it. */
  onOpen: () => void
  onPick: (hex: string | null) => void
}

/** A Word-style color tool: a button showing the last-used color as an
 * underline bar, opening a dropdown grid of swatches on click. */
function ColorPickerButton({
  label,
  icon,
  letter,
  colors,
  activeColor,
  noneLabel,
  onOpen,
  onPick,
}: ColorPickerButtonProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="rich-editor-color-picker">
      <button
        type="button"
        className="rich-editor-tool rich-editor-color-trigger"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        title={label}
        onMouseDown={(e) => {
          e.preventDefault()
          onOpen()
        }}
        onClick={() => setOpen((o) => !o)}
      >
        {icon ? <Icon name={icon} size={16} /> : <span className="rich-editor-color-letter">{letter}</span>}
        <span className="rich-editor-color-bar" style={{ background: activeColor }} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="rich-editor-color-popover" role="menu" aria-label={label}>
            <div className="rich-editor-color-grid">
              {colors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="menuitem"
                  className="rich-editor-swatch"
                  style={{ background: c.hex }}
                  aria-label={c.name}
                  title={c.name}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(c.hex)
                    setOpen(false)
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              role="menuitem"
              className="rich-editor-color-none"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(null)
                setOpen(false)
              }}
            >
              <Icon name="close" size={14} /> {noneLabel}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
