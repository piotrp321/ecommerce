import type { CategoryNode } from '../api/types';

export interface CategoryOption {
  id: string;
  name: string;
  /** "Elektronika › Laptopy" */
  path: string;
  depth: number;
}

/** Flattens the tree (as returned by the API) for <select> options, in tree order. */
export function categoryOptions(nodes: readonly CategoryNode[], parents: string[] = []): CategoryOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, path: [...parents, node.name].join(' › '), depth: parents.length },
    ...categoryOptions(node.children, [...parents, node.name]),
  ]);
}
