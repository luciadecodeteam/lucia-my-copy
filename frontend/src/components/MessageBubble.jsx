// lucia-secure/frontend/src/components/MessageBubble.jsx

import React from 'react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import '../styles/markdown.css'

// Markdown config: linkify URLs, single newlines become <br>, disallow raw HTML
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

function toText(x) {
  // Add debugging
  console.log('toText input:', x, typeof x)
  
  if (x == null) return ''
  if (typeof x === 'string') return x
  if (Array.isArray(x)) return x.map(toText).join('\n')
  if (typeof x === 'object') {
    // Check more possible properties
    if (typeof x.text === 'string') return x.text
    if (typeof x.message === 'string') return x.message
    if (typeof x.content === 'string') return x.content
    if (Array.isArray(x.content)) return x.content.map(toText).join('\n')
    if (Array.isArray(x.parts)) return x.parts.map(toText).join('\n')
    
    // Log the object structure for debugging
    console.log('Object keys:', Object.keys(x))
    
    try { 
      // Try JSON stringify as fallback
      const str = JSON.stringify(x)
      if (str !== '{}') return str
      return String(x) 
    } catch { 
      return '' 
    }
  }
  return String(x)
}

export default function MessageBubble({ role = 'assistant', content, children }) {
  const isUser = role === 'user'

  // Debug logging
  console.log('MessageBubble props:', { role, content, children })

  // If children is a React node (e.g., your typing dots), render it directly.
  // If it's a string, or if children is empty, we'll render markdown from text.
  let hasReactChildren = false
  let childIsString = false
  if (children !== undefined) {
    hasReactChildren = React.isValidElement(children) || (Array.isArray(children) && children.some(React.isValidElement))
    childIsString = typeof children === 'string'
  }

  // Preferred text source order: string children → content prop → empty
  const rawText = childIsString ? children : toText(content)
  
  console.log('Final rawText:', rawText)

  let html = ''
  if (!hasReactChildren) {
    let rendered = md.render(rawText || '')
    if (rendered) {
      // open links in new tab safely
      rendered = rendered.replace(/<a /g, '<a target="_blank" rel="noopener" ')
    }
    html = DOMPurify.sanitize(rendered || '')
    console.log('Final HTML:', html)
  }

  return (
    <div className={`bubble ${isUser ? 'user' : 'assistant'}`}>
      <div className="role">{isUser ? 'You' : 'Lucía'}</div>

      <div className="md">
        {hasReactChildren ? (
          children // e.g., the typing indicator spans
        ) : (
          // Add fallback display for debugging
          <div>
            <span dangerouslySetInnerHTML={{ __html: html || '<p>No content</p>' }} />
            {!html && (
              <div style={{ color: '#ff4757', fontSize: '0.8rem', marginTop: '8px' }}>
                Debug: rawText = "{rawText}", content = {JSON.stringify(content)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}