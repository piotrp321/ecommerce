import { siteMetadata } from './site-metadata';

describe('siteMetadata', () => {
  it('keeps demo data out of search engines', () => {
    expect(siteMetadata(true).robots).toEqual({ index: false, follow: false });
  });

  it('lets a real catalog be indexed', () => {
    expect(siteMetadata(false)).not.toHaveProperty('robots');
  });
});
