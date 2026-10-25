'use client'

import Image from 'next/image'
import { ArrowRight, ArrowUpLeft, ArrowUpRight, BookOpen, Search, Star, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { searchCourses, type CourseSearchResult } from '@/lib/search/course-search'

type CourseSearchProps = {
  isDrawerOpen: boolean
  onSearchOpen: () => void
  onSelect?: (result: CourseSearchResult) => void
}

function foldedCharacter(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLocaleLowerCase()
}

function highlightMatch(value: string, query: string) {
  const normalizedQuery = [...query].map(foldedCharacter).join('').trim()
  const sourceMap: Array<{ start: number; end: number }> = []
  let normalizedValue = ''
  let offset = 0

  for (const character of value) {
    const folded = foldedCharacter(character)
    for (let index = 0; index < folded.length; index += 1) {
      normalizedValue += folded[index]
      sourceMap.push({ start: offset, end: offset + character.length })
    }
    offset += character.length
  }

  const matchStart = normalizedValue.indexOf(normalizedQuery)
  if (matchStart < 0 || !normalizedQuery) return value
  const matchEnd = matchStart + normalizedQuery.length - 1
  const start = sourceMap[matchStart]?.start
  const end = sourceMap[matchEnd]?.end
  if (start === undefined || end === undefined) return value

  return <>{value.slice(0, start)}<mark>{value.slice(start, end)}</mark>{value.slice(end)}</>
}

export function CourseSearch({ isDrawerOpen, onSearchOpen, onSelect }: CourseSearchProps) {
  const { language, t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CourseSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [panelOpen, setPanelOpen] = useState(false)
  const [desktopFocused, setDesktopFocused] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [toast, setToast] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const desktopInputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const previousMobileOpen = useRef(false)
  const listboxId = useId()
  const queryIsSearchable = [...query.trim()].length >= 2
  const panelVisible = panelOpen && !isDrawerOpen
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
  const localizedResults = results.length === 1
    ? t('courseSearch.resultCountOne').replace('{count}', '1')
    : t('courseSearch.resultCount').replace('{count}', String(results.length))

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setMobileOpen(false)
    setActiveIndex(-1)
    setLoading(false)
  }, [])

  const updateQuery = (value: string) => {
    setQuery(value)
    setResults([])
    setError(false)
    setActiveIndex(-1)
    setLoading([...value.trim()].length >= 2 && panelOpen)
  }

  const openPanel = useCallback(() => {
    setPanelOpen(true)
    if (query.trim().length >= 2) {
      setLoading(true)
      setError(false)
    }
  }, [query])

  const focusSearch = useCallback(() => {
    onSearchOpen()
    if (window.matchMedia('(min-width: 64rem)').matches) {
      openPanel()
      desktopInputRef.current?.focus()
    } else {
      setMobileOpen(true)
      openPanel()
    }
  }, [onSearchOpen, openPanel])

  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus()
    else if (previousMobileOpen.current && !isDrawerOpen) mobileTriggerRef.current?.focus()
    previousMobileOpen.current = mobileOpen
  }, [mobileOpen, isDrawerOpen])

  useEffect(() => {
    if (!isDrawerOpen) return
    const closeTimer = window.setTimeout(closePanel, 0)
    return () => window.clearTimeout(closeTimer)
  }, [isDrawerOpen, closePanel])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      event.preventDefault()
      focusSearch()
    }
    document.addEventListener('keydown', onShortcut)
    return () => document.removeEventListener('keydown', onShortcut)
  }, [focusSearch])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePanel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [closePanel])

  useEffect(() => {
    if (!panelVisible || !queryIsSearchable) return

    const controller = new AbortController()
    const debounce = window.setTimeout(() => {
      setLoading(true)
      void searchCourses(query, { limit: 6, signal: controller.signal })
        .then((nextResults) => {
          if (!controller.signal.aborted) setResults(nextResults)
        })
        .catch((searchError: unknown) => {
          if (!controller.signal.aborted && !(searchError instanceof DOMException && searchError.name === 'AbortError')) {
            setError(true)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)

    return () => {
      window.clearTimeout(debounce)
      controller.abort()
    }
  }, [panelVisible, query, queryIsSearchable, retryCount])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(false), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const selectResult = (result: CourseSearchResult) => {
    onSelect?.(result)
    setToast(true)
    closePanel()
    // TODO: replace this notice with router.push(`/courses/${result.id}`) once course routes exist.
  }

  const viewAll = () => {
    if (results[0]) selectResult(results[0])
  }

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (query) updateQuery('')
      else closePanel()
      return
    }
    if (event.key === 'ArrowDown') {
      if (!results.length) return
      event.preventDefault()
      setActiveIndex((current) => current >= results.length ? 0 : current + 1)
      return
    }
    if (event.key === 'ArrowUp') {
      if (!results.length) return
      event.preventDefault()
      setActiveIndex((current) => current <= 0 ? results.length : current - 1)
      return
    }
    if (event.key === 'Home') {
      if (!results.length) return
      event.preventDefault()
      setActiveIndex(0)
      return
    }
    if (event.key === 'End') {
      if (!results.length) return
      event.preventDefault()
      setActiveIndex(results.length)
      return
    }
    if (event.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < results.length) {
        event.preventDefault()
        selectResult(results[activeIndex])
      } else if (results.length && (activeIndex === results.length || activeIndex < 0)) {
        event.preventDefault()
        viewAll()
      }
    }
  }

  const placeholder = t('courseSearch.placeholder')
  const inputProps = {
    role: 'combobox' as const,
    'aria-expanded': panelVisible,
    'aria-controls': listboxId,
    'aria-autocomplete': 'list' as const,
    'aria-activedescendant': activeOptionId,
    value: query,
    placeholder,
    onChange: (event: ChangeEvent<HTMLInputElement>) => updateQuery(event.target.value),
    onFocus: () => { setDesktopFocused(true); openPanel() },
    onBlur: () => setDesktopFocused(false),
    onKeyDown: onInputKeyDown,
  }

  return (
    <div className="course-search" ref={rootRef}>
      <div className="course-search-desktop">
        <Search size={20} strokeWidth={2} aria-hidden="true" className="course-search-field-icon" />
        <input ref={desktopInputRef} {...inputProps} aria-label={t('courseSearch.label')} />
        {!query && !desktopFocused && <kbd aria-hidden="true">/</kbd>}
      </div>
      <button
        ref={mobileTriggerRef}
        className="course-search-trigger"
        type="button"
        aria-label={t('courseSearch.open')}
        aria-expanded={mobileOpen}
        aria-controls={listboxId}
        onClick={() => { onSearchOpen(); setMobileOpen(true); setPanelOpen(true) }}
      >
        <Search size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <div className={`course-search-mobile-overlay${mobileOpen ? ' is-open' : ''}`} aria-hidden={!mobileOpen} inert={!mobileOpen}>
          <button className="course-search-back" type="button" aria-label={t('courseSearch.close')} onClick={closePanel}>
            {language === 'ar' ? <ArrowUpRight size={20} strokeWidth={2} aria-hidden="true" /> : <ArrowUpLeft size={20} strokeWidth={2} aria-hidden="true" />}
          </button>
          <Search size={20} strokeWidth={2} aria-hidden="true" className="course-search-field-icon" />
          <input ref={mobileInputRef} {...inputProps} aria-label={t('courseSearch.label')} />
          {query && <button className="course-search-clear" type="button" aria-label={t('courseSearch.clear')} onClick={() => updateQuery('')}><X size={20} strokeWidth={2} aria-hidden="true" /></button>}
      </div>
      <div className={`course-search-panel${panelVisible ? ' is-open' : ''}`} hidden={!panelVisible}>
        {!queryIsSearchable && <p className="course-search-message">{query.trim() ? t('courseSearch.minimum') : t('courseSearch.idle')}</p>}
        {queryIsSearchable && loading && <div className="course-search-skeleton" role="status" aria-label={t('courseSearch.loading')}>
          {[0, 1, 2].map((index) => <div className="course-search-skeleton-row" key={index}><i /><span><i /><i /></span></div>)}
        </div>}
        {queryIsSearchable && !loading && error && <div className="course-search-message course-search-error" role="alert">
          <p>{t('courseSearch.error')}</p>
          <button type="button" onClick={() => { setLoading(true); setError(false); setRetryCount((count) => count + 1) }}>{t('courseSearch.retry')}</button>
        </div>}
        {queryIsSearchable && !loading && !error && results.length === 0 && <div className="course-search-message course-search-empty">
          <Search size={20} strokeWidth={2} aria-hidden="true" />
          <p>{t('courseSearch.empty').replace('{query}', query.trim())}</p>
          <small>{t('courseSearch.tryDifferent')}</small>
        </div>}
        <div id={listboxId} role="listbox" aria-label={t('courseSearch.resultsLabel')}>
        {queryIsSearchable && !loading && !error && results.map((result, index) => (
          <button
            id={`${listboxId}-option-${index}`}
            className={`course-search-result${activeIndex === index ? ' is-active' : ''}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={activeIndex === index}
            key={result.id}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActiveIndex(index)}
            onClick={() => selectResult(result)}
          >
            <span className="course-search-thumbnail">
              {result.coverImageUrl?.startsWith('linear-gradient(')
                ? <span className="course-search-thumbnail-gradient" style={{ backgroundImage: result.coverImageUrl }} />
                : result.coverImageUrl
                  ? <Image src={result.coverImageUrl} alt="" fill sizes="40px" unoptimized />
                  : <span className="course-search-thumbnail-fallback">{result.category.charAt(0)}</span>}
            </span>
            <span className="course-search-copy">
              <strong>{highlightMatch(result.title, query)}</strong>
              <span><b>{highlightMatch(result.category, query)}</b><small>{highlightMatch(result.instructorName, query)}</small></span>
            </span>
            <span className="course-search-meta"><span><Star size={16} strokeWidth={2} aria-hidden="true" />{result.rating.toFixed(1)}</span>{result.isEnrolled && <small>{t('courseSearch.enrolled')}</small>}</span>
          </button>
        ))}
        {queryIsSearchable && !loading && !error && results.length > 0 && (
          <button className={`course-search-view-all${activeIndex === results.length ? ' is-active' : ''}`} id={`${listboxId}-option-${results.length}`} type="button" role="option" tabIndex={-1} aria-selected={activeIndex === results.length} onMouseDown={(event) => event.preventDefault()} onClick={viewAll}>
            <span>{t('courseSearch.viewAll').replace('{query}', query.trim())}</span>
            <ArrowRight size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">{queryIsSearchable && !loading && !error ? results.length ? localizedResults : t('courseSearch.noResults') : ''}</span>
      {toast && <div className="course-search-toast" role="status" aria-live="polite"><BookOpen size={16} strokeWidth={2} aria-hidden="true" />{t('courseSearch.toast')}</div>}
    </div>
  )
}
