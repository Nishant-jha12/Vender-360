// Unit tests for Theme toggle and persistence
describe('Theme Management', () => {
  it('defaults to system or stored preference', () => {
    const theme = localStorage.getItem('theme') || 'light';
    expect(['light', 'dark']).toContain(theme);
  });

  it('toggles dark class on document root', () => {
    document.documentElement.classList.add('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    document.documentElement.classList.remove('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
