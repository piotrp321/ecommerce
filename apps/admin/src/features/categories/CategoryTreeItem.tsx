import type { CSSProperties } from 'react';
import type { CategoryNode } from '../../api/types';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';

export interface CategoryActions {
  onAddChild: (node: CategoryNode) => void;
  onEdit: (node: CategoryNode) => void;
  onMove: (node: CategoryNode) => void;
  onDelete: (node: CategoryNode) => void;
}

interface CategoryTreeItemProps extends CategoryActions {
  node: CategoryNode;
  depth: number;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

function productLabel(count: number): string {
  if (count === 1) return '1 produkt';
  const lastDigit = count % 10;
  const lastTwo = count % 100;

  return lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14) ? `${String(count)} produkty` : `${String(count)} produktów`;
}

export function CategoryTreeItem({ node, depth, expanded, onToggle, ...actions }: CategoryTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = hasChildren && expanded.has(node.id);
  const childrenId = `category-children-${node.id}`;

  return (
    <li className="tree__item">
      <div className="tree__row" style={{ '--depth': depth } as CSSProperties}>
        {hasChildren ? (
          <button
            type="button"
            className="tree__toggle"
            aria-expanded={isExpanded}
            aria-controls={childrenId}
            aria-label={`${isExpanded ? 'Zwiń' : 'Rozwiń'} ${node.name}`}
            onClick={() => {
              onToggle(node.id);
            }}
          >
            <Icon name="chevronRight" size={16} className={isExpanded ? 'tree__chevron tree__chevron--open' : 'tree__chevron'} />
          </button>
        ) : (
          <span className="tree__toggle tree__toggle--leaf" aria-hidden="true" />
        )}
        <Icon name="folder" className="tree__icon" />
        <div className="tree__label">
          <span className="tree__name">{node.name}</span>
          <span className="tree__slug">/{node.slug}</span>
        </div>
        <div className="tree__meta">
          {hasChildren && <span className="tree__count">{node.children.length} podkat.</span>}
          <Badge tone={node.productCount > 0 ? 'accent' : 'neutral'}>{productLabel(node.productCount)}</Badge>
        </div>
        <div className="tree__actions">
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            title="Dodaj podkategorię"
            aria-label={`Dodaj podkategorię do ${node.name}`}
            onClick={() => {
              actions.onAddChild(node);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="edit"
            title="Edytuj"
            aria-label={`Edytuj ${node.name}`}
            onClick={() => {
              actions.onEdit(node);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="move"
            title="Przenieś"
            aria-label={`Przenieś ${node.name}`}
            onClick={() => {
              actions.onMove(node);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            title="Usuń"
            className="btn--danger-text"
            aria-label={`Usuń ${node.name}`}
            onClick={() => {
              actions.onDelete(node);
            }}
          />
        </div>
      </div>
      {isExpanded && (
        <ul id={childrenId} className="tree__children" role="list">
          {node.children.map((child) => (
            <CategoryTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              {...actions}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
