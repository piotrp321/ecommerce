/**
 * Suggests a URL slug from a name ("Dom i ogród" -> "dom-i-ogrod").
 * Only a convenience for the form; the backend validates the slug.
 */
export function slugify(text: string): string {
  return text
    .replace(/[łŁ]/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}
