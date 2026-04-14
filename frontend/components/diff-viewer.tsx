'use client'

import { cn } from '@/lib/utils'

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface DiffFile {
  filename: string
  hunks: DiffHunk[]
}
import { ChevronDown, ChevronRight, FileCode } from 'lucide-react'
import { useState } from 'react'

interface DiffViewerProps {
  files: DiffFile[]
  title?: string
  className?: string
}

export function DiffViewer({ files, title, className }: DiffViewerProps) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      {title && (
        <div className="border-b border-border bg-muted/50 px-4 py-2">
          <h3 className="font-mono text-sm font-medium text-primary">{title}</h3>
        </div>
      )}
      <div className="divide-y divide-border">
        {files.map((file, idx) => (
          <DiffFileView key={idx} file={file} defaultOpen={idx === 0} />
        ))}
      </div>
    </div>
  )
}

function DiffFileView({ file, defaultOpen = false }: { file: DiffFile; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 bg-diff-header-bg px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <FileCode className="h-4 w-4 text-primary" />
        <span className="font-mono text-sm text-primary">{file.filename}</span>
      </button>
      
      {isOpen && (
        <div className="overflow-x-auto bg-diff-context-bg">
          {file.hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx} className="border-t border-border/50">
              <div className="bg-diff-header-bg px-4 py-1 font-mono text-xs text-muted-foreground">
                {hunk.header}
              </div>
              <div className="font-mono text-sm">
                {hunk.lines.map((line, lineIdx) => (
                  <div
                    key={lineIdx}
                    className={cn(
                      'flex min-h-[1.5rem] items-center px-4',
                      line.type === 'add' && 'bg-diff-add-bg',
                      line.type === 'remove' && 'bg-diff-remove-bg',
                      line.type === 'context' && 'bg-diff-context-bg'
                    )}
                  >
                    <span className="w-12 shrink-0 select-none pr-4 text-right text-xs text-muted-foreground">
                      {line.oldLine ?? ''}
                    </span>
                    <span className="w-12 shrink-0 select-none pr-4 text-right text-xs text-muted-foreground">
                      {line.newLine ?? ''}
                    </span>
                    <span
                      className={cn(
                        'flex-1 whitespace-pre',
                        line.type === 'add' && 'text-diff-add-text',
                        line.type === 'remove' && 'text-diff-remove-text',
                        line.type === 'context' && 'text-foreground/80'
                      )}
                    >
                      {line.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Simplified version for side-by-side comparison
interface SideBySideDiffProps {
  leftFiles: DiffFile[]
  rightFiles: DiffFile[]
  leftTitle: string
  rightTitle: string
  className?: string
}

export function SideBySideDiff({ 
  leftFiles, 
  rightFiles, 
  leftTitle, 
  rightTitle,
  className 
}: SideBySideDiffProps) {
  return (
    <div className={cn('grid gap-4 lg:grid-cols-2', className)}>
      <DiffViewer files={leftFiles} title={leftTitle} />
      <DiffViewer files={rightFiles} title={rightTitle} />
    </div>
  )
}
