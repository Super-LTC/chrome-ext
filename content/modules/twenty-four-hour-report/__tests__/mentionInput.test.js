import { describe, it, expect } from 'vitest';
import { toMentionTokens } from '../components/MentionInput.jsx';

const JO = { id: 'abc123', name: 'Joanna Lucius', email: 'joanna@example.com' };
const JOHN = { id: 'def456', name: 'John', email: 'john@example.com' };
const ANN = { id: 'ghi789', name: 'Ann', email: 'ann@example.com' };
const ANNMARIE = { id: 'jkl012', name: 'Ann Marie', email: 'annmarie@example.com' };

describe('toMentionTokens', () => {
  it('converts a picked name to a token', () => {
    expect(toMentionTokens('hey @Joanna Lucius look', [JO])).toBe('hey @[user:abc123] look');
  });

  it('leaves a typed-but-never-picked name alone', () => {
    // Fuzzy-matching names at submit time would eventually tag the wrong
    // person. Only an explicit pick becomes a tag.
    expect(toMentionTokens('hey @joanna look', [])).toBe('hey @joanna look');
  });

  it('converts every occurrence of the same person', () => {
    expect(toMentionTokens('@John and @John', [JOHN])).toBe('@[user:def456] and @[user:def456]');
  });

  it('handles several people in one comment', () => {
    expect(toMentionTokens('@John @Joanna Lucius', [JOHN, JO])).toBe(
      '@[user:def456] @[user:abc123]'
    );
  });

  it('does not let a shorter name eat a longer one', () => {
    // "@Ann Marie" must not be half-replaced into "@[user:ghi789] Marie".
    expect(toMentionTokens('@Ann Marie please', [ANN, ANNMARIE])).toBe(
      '@[user:jkl012] please'
    );
  });

  it('falls back to the email local part when there is no name', () => {
    const noName = { id: 'x1', name: null, email: 'ricky@example.com' };
    expect(toMentionTokens('@ricky hi', [noName])).toBe('@[user:x1] hi');
  });

  it('leaves plain text untouched', () => {
    expect(toMentionTokens('no tags here', [JO])).toBe('no tags here');
    expect(toMentionTokens('', [JO])).toBe('');
  });

  it('does not tag a bare email address in the text', () => {
    expect(toMentionTokens('mail me at bob@example.com', [JO])).toBe(
      'mail me at bob@example.com'
    );
  });
});
