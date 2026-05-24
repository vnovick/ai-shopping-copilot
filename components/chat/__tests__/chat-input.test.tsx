import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatInput } from '../chat-input'

describe('ChatInput', () => {
  it('calls onSend with the trimmed text when Enter is pressed', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '  wireless headphones  ' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('wireless headphones')
  })

  it('ignores Enter when the input is empty', () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('ignores Enter while disabled and Shift+Enter inserts a newline', () => {
    const onSend = vi.fn()
    const { rerender } = render(<ChatInput onSend={onSend} disabled />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'hi' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()

    rerender(<ChatInput onSend={onSend} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })
})
