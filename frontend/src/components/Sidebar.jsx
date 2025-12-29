import React, { useEffect, useMemo, useState, useRef } from 'react'
import { emitQuickPrompt } from '../lib/bus'
import { useAuthToken } from '../hooks/useAuthToken'
import {
  auth,
  createConversation, db,
  newConversationId, createConversationWithId,
  softDeleteConversation, setConversationTitle, setConversationFolder
} from '../firebase'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import '../styles/slots.css'
import '../styles/sidebar.css'

function InlineModal({ title, value, setValue, onCancel, onSave, placeholder, okLabel = "OK" }) {
  function onKey(e) {
    if (e.key === 'Enter') onSave()
    if (e.key === 'Escape') onCancel()
  }
  return (
    <div className="slotmodal-overlay" role="dialog" aria-modal="true">
      <div className="slotmodal">
        <div className="slotmodal-header">{title}</div>
        <input
          autoFocus
          className="slotmodal-input"
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="slotmodal-actions">
          <button className="btn ghost" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn primary" type="button" onClick={onSave}>{okLabel}</button>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  const { user } = useAuthToken()
  const [menuOpen, setMenuOpen] = useState(false)
  const [convos, setConvos] = useState([])
  const [loadingConvos, setLoadingConvos] = useState(false)

  const [currentFolder, setCurrentFolder] = useState(null)
  const [openKebabFor, setOpenKebabFor] = useState(null)
  const kebabRef = useRef(null)

  // Clean ASCII (no smart quotes)
  const firstPrompt = "I don't even know what I've gotten myself into. Give me light on this."
  const chips = [firstPrompt, 'Summarize', 'Explain', 'Improve tone', 'List steps', 'Generate plan']
  const clickChip = (text) => { emitQuickPrompt(text); onClose?.() }

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User'
  const email = user?.email || ''
  const currentCid = new URLSearchParams(window.location.search).get('c') || null

  useEffect(() => {
    function onClick(e) {
      if (!kebabRef.current) return
      if (!kebabRef.current.contains(e.target)) setOpenKebabFor(null)
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    setConvos([])
    setLoadingConvos(true)

    const q = query(
      collection(db, 'users', user.uid, 'conversations'),
      orderBy('updatedAt', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const list = rows.filter(c => {
        const tNew = (c.title || '').toLowerCase() === 'new chat'
        const upd = c.updatedAt?.toMillis?.() ?? 0
        const crt = c.createdAt?.toMillis?.() ?? 0
        const deleted = Boolean(c.deletedAt)
        return (!tNew || upd > crt) && !deleted
      })
      setConvos(prev => {
        const optimistic = prev.filter(x => x.__optimistic && !list.find(y => y.id === x.id))
        return [...optimistic, ...list]
      })
      setLoadingConvos(false)
    }, () => setLoadingConvos(false))

    return () => unsub()
  }, [user?.uid])

  const folders = useMemo(() => {
    const s = new Set()
    for (const c of convos) if (c.folder) s.add(c.folder)
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [convos])

  const visibleConvos = useMemo(() => {
    return convos.filter(c => currentFolder ? c.folder === currentFolder : true)
  }, [convos, currentFolder])

  async function handleNewChat() {
    if (!auth.currentUser) {
      window.dispatchEvent(new CustomEvent('lucia:show-login'))
      return
    }
    const uid = auth.currentUser.uid

    const cid = newConversationId(uid)
    setConvos(prev => [{ id: cid, title: 'New chat', __optimistic: true }, ...prev])

    const url = new URL(window.location.href)
    url.searchParams.set('c', cid)
    window.history.pushState({}, '', url)
    window.dispatchEvent(new CustomEvent('lucia:switch-chat', { detail: { cid } }))
    onClose?.()

    try {
      await createConversationWithId(uid, cid, { title: 'New chat', system: '' })
    } catch (err) {
      console.error('createConversationWithId failed', err)
      setConvos(prev => prev.filter(x => x.id !== cid))
    }
  }

  function openConversation(cid) {
    const url = new URL(window.location.href)
    url.searchParams.set('c', cid)
    window.history.pushState({}, '', url)
    window.dispatchEvent(new CustomEvent('lucia:switch-chat', { detail: { cid } }))
    onClose?.()
  }

  async function handleDeleteChat(cid) {
    if (!user?.uid) return
    await softDeleteConversation(user.uid, cid)
    setOpenKebabFor(null)
  }

  // Rename / folder modals
  function openRenameModal(cid, currentTitle) {
    setOpenKebabFor(null)
    setRenameFor({ cid, currentTitle })
    setRenameValue(currentTitle || '')
  }
  const [renameFor, setRenameFor] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  async function confirmRename() {
    if (!user?.uid || !renameFor) return
    const next = renameValue.trim()
    if (!next) { setRenameFor(null); return }
    await setConversationTitle(user.uid, renameFor.cid, next.slice(0, 80))
    setRenameFor(null)
  }

  function openNewFolderModal(cid) {
    setOpenKebabFor(null)
    setNewFolderFor({ cid })
    setNewFolderValue('')
  }
  const [newFolderFor, setNewFolderFor] = useState(null)
  const [newFolderValue, setNewFolderValue] = useState('')
  async function confirmNewFolder() {
    if (!user?.uid || !newFolderFor) return
    const name = newFolderValue.trim().slice(0, 48)
    if (!name) { setNewFolderFor(null); return }
    await setConversationFolder(user.uid, newFolderFor.cid, name)
    setNewFolderFor(null)
  }

  // Navigate to footer pages (Terms / Privacy / Pricing)
  function navigateToPage(page) {
    setMenuOpen(false)
    const url = new URL(window.location.href)
    url.searchParams.set('page', page)
    window.history.pushState({}, '', url)
    window.dispatchEvent(new CustomEvent('lucia:navigate-page', { detail: { page } }))
    onClose?.()
  }

  const openLoginModal = () => window.dispatchEvent(new CustomEvent('lucia:show-login'))

  // Small inline SVGs
  const Ellipsis = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  )
  const CaretDown = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10l5 5 5-5H7z" fill="currentColor" />
    </svg>
  )

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-content">
        <div className="sidebar-top">
          <h4>Folders</h4>
          <div className="chips-wrap">
            <span className={`chip${currentFolder === null ? ' active' : ''}`} onClick={() => setCurrentFolder(null)} title="All chats">All</span>
            {folders.map(f => (
              <span key={f} className={`chip${currentFolder === f ? ' active' : ''}`} onClick={() => setCurrentFolder(f)} title={f}>{f}</span>
            ))}
          </div>

          <h4 style={{ marginTop: 16 }}>Quick Prompts</h4>
          <div className="chips-wrap">
            <span className="chip" onClick={handleNewChat}>+ New chat</span>
            {chips.map((c) => (
              <span key={c} className="chip" onClick={() => clickChip(c)}>{c}</span>
            ))}
          </div>

          <h4 style={{ marginTop: 16 }}>Slots</h4>
          {!user ? (
            <div className="chips-wrap">
              <span className="chip" onClick={openLoginModal}>Log in to see chats</span>
            </div>
          ) : loadingConvos ? (
            <div className="slots-skeleton">
              <div className="slot-row"></div>
              <div className="slot-row"></div>
              <div className="slot-row"></div>
            </div>
          ) : (
            <div className="slots-list" ref={kebabRef}>
              {visibleConvos.length === 0 ? (
                <button className="chip slot-btn" onClick={handleNewChat}>No chats yet — create one</button>
              ) : (
                visibleConvos.map(c => (
                  <div key={c.id} className="slot-row-wrapper">
                    <button
                      className={`chip slot-btn${c.__optimistic ? ' loading' : ''}`}
                      aria-current={currentCid === c.id ? 'page' : undefined}
                      onClick={() => openConversation(c.id)}
                      title={c.title || 'Untitled'}
                    >
                      <span className="slot-title">{c.title || 'Untitled'}</span>
                      {c.folder && <span className="slot-folder">• {c.folder}</span>}
                    </button>

                    <button
                      className="kebab-btn"
                      title="Options"
                      onClick={(e) => { e.stopPropagation(); setOpenKebabFor(openKebabFor === c.id ? null : c.id) }}
                      aria-label="Conversation options"
                    >
                      <Ellipsis />
                    </button>

                    {openKebabFor === c.id && (
                      <div className="slot-menu">
                        <button className="menu-item rename-item" onClick={(e) => { e.stopPropagation(); openRenameModal(c.id, c.title) }}>Rename</button>

                        <div className="menu-sep"></div>
                        <div className="menu-label">Move to folder</div>
                        <button className="menu-item" onClick={(e) => { e.stopPropagation(); setConversationFolder(user.uid, c.id, null); setOpenKebabFor(null) }}>Unfiled</button>
                        {folders.map(f => (
                          <button key={f} className={`menu-item${c.folder === f ? ' active' : ''}`} onClick={(e) => { e.stopPropagation(); setConversationFolder(user.uid, c.id, f); setOpenKebabFor(null) }}>{f}</button>
                        ))}
                        <button className="menu-item new-folder-item" onClick={(e) => { e.stopPropagation(); openNewFolderModal(c.id) }}>New folder…</button>

                        <div className="menu-sep"></div>
                        <button className="menu-item danger" onClick={(e) => { e.stopPropagation(); handleDeleteChat(c.id) }}>Delete</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="sidebar-bottom">
          {!user ? (
            <button className="user-footer login" onClick={openLoginModal}>Log in</button>
          ) : (
            <>
              <div className="user-footer" onClick={() => setMenuOpen((s) => !s)} title={email}>
                <div className="avatar">{(displayName || 'U').slice(0, 1).toUpperCase()}</div>
                <div className="user-meta">
                  <div className="name">{displayName}</div>
                  <div className="mail">{email}</div>
                </div>
                <div className="caret"><CaretDown /></div>
              </div>

              {menuOpen && (
                <div className="user-menu">
                  <button className="user-menu-item" onClick={(e) => { e.stopPropagation(); navigateToPage('terms') }}>
                    Terms of Service
                  </button>
                  <button className="user-menu-item" onClick={(e) => { e.stopPropagation(); navigateToPage('privacy') }}>
                    Privacy Policy
                  </button>
                  {/* New: Pricing next to Terms/Privacy */}
                  <button className="user-menu-item" onClick={(e) => { e.stopPropagation(); navigateToPage('pricing') }}>
                    Pricing & Plans
                  </button>
                  <div className="menu-sep"></div>
                  <button
                    className="user-menu-item danger"
                    onClick={async (e) => { e.stopPropagation(); setMenuOpen(false); (await import('../firebase')).signOut(auth) }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {renameFor && (
        <InlineModal
          title="Rename chat"
          value={renameValue}
          setValue={setRenameValue}
          placeholder="Untitled"
          onCancel={() => setRenameFor(null)}
          onSave={confirmRename}
          okLabel="Save"
        />
      )}
      {newFolderFor && (
        <InlineModal
          title="New folder name"
          value={newFolderValue}
          setValue={setNewFolderValue}
          placeholder="e.g., Research"
          onCancel={() => setNewFolderFor(null)}
          onSave={confirmNewFolder}
          okLabel="Create"
        />
      )}
    </aside>
  )
}
