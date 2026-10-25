import { useCallback, useMemo, useState } from 'react';
import { useAdminApi } from '../../api/AdminApiContext';
import type { CategoryInput, CategoryNode } from '../../api/types';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/toastContext';
import { categoryOptions } from '../../lib/categoryOptions';
import { useAsync } from '../../lib/useAsync';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { CategoryFormDialog } from './CategoryFormDialog';
import { CategoryTreeItem } from './CategoryTreeItem';
import { MoveCategoryDialog } from './MoveCategoryDialog';

type DialogState =
  | { kind: 'create'; parent: CategoryNode | null }
  | { kind: 'edit'; node: CategoryNode }
  | { kind: 'move'; node: CategoryNode }
  | { kind: 'delete'; node: CategoryNode };

function idsWithChildren(nodes: readonly CategoryNode[]): string[] {
  return nodes.flatMap((node) => (node.children.length > 0 ? [node.id, ...idsWithChildren(node.children)] : []));
}

export function CategoriesPage() {
  useDocumentTitle('Kategorie');
  const api = useAdminApi();
  const toast = useToast();
  const load = useCallback(() => api.listCategories(), [api]);
  const { data: tree, error, loading, reload, update } = useAsync(load);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogKey, setDialogKey] = useState(0);

  // Branches are expanded by default; the state remembers the collapsed ones,
  // so new subcategories show up without extra clicks.
  const expanded = useMemo(
    () => new Set(idsWithChildren(tree ?? []).filter((id) => !collapsed.has(id))),
    [tree, collapsed],
  );
  const options = useMemo(() => categoryOptions(tree ?? []), [tree]);

  const open = (next: DialogState) => {
    setDialogKey((key) => key + 1);
    setDialog(next);
  };
  const close = () => {
    setDialog(null);
  };

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }, []);

  /**
   * Loads the tree after a change before the dialog closes, so the dialog
   * returns focus to an element that still exists (after a delete or a move
   * the opener is gone and focus goes to the page heading). If only this
   * reload fails, the change was saved: the page shows its error state.
   */
  async function refreshTree() {
    try {
      const fresh = await api.listCategories();
      update(() => fresh);
    } catch {
      reload();
    }
  }

  async function create(parent: CategoryNode | null, input: CategoryInput) {
    const created = await api.createCategory({ ...input, parentId: parent?.id ?? null });
    if (parent !== null) {
      setCollapsed((current) => new Set([...current].filter((id) => id !== parent.id)));
    }
    await refreshTree();
    close();
    toast(`Dodano kategorię „${created.name}”.`);
  }

  async function edit(node: CategoryNode, input: CategoryInput) {
    const updated = await api.updateCategory(node.id, input);
    await refreshTree();
    close();
    toast(`Zapisano kategorię „${updated.name}”.`);
  }

  async function move(node: CategoryNode, parentId: string | null) {
    await api.moveCategory(node.id, parentId);
    await refreshTree();
    close();
    const target = options.find((option) => option.id === parentId);
    toast(target === undefined ? `Przeniesiono „${node.name}” na poziom główny.` : `Przeniesiono „${node.name}” do „${target.name}”.`);
  }

  async function remove(node: CategoryNode) {
    await api.deleteCategory(node.id);
    await refreshTree();
    toast(`Usunięto kategorię „${node.name}”.`);
  }

  const actions = {
    onAddChild: (node: CategoryNode) => {
      open({ kind: 'create', parent: node });
    },
    onEdit: (node: CategoryNode) => {
      open({ kind: 'edit', node });
    },
    onMove: (node: CategoryNode) => {
      open({ kind: 'move', node });
    },
    onDelete: (node: CategoryNode) => {
      open({ kind: 'delete', node });
    },
  };

  let content;
  if (error !== undefined) {
    content = <ErrorState error={error} onRetry={reload} />;
  } else if (tree === undefined) {
    content = <LoadingState label="Wczytywanie kategorii…" rows={7} />;
  } else if (tree.length === 0) {
    content = (
      <EmptyState
        icon="folder"
        title="Brak kategorii"
        action={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              open({ kind: 'create', parent: null });
            }}
          >
            Dodaj kategorię główną
          </Button>
        }
      >
        Kategorie porządkują ofertę sklepu w drzewo.
      </EmptyState>
    );
  } else {
    content = (
      <ul className={loading ? 'tree is-refreshing' : 'tree'} aria-label="Drzewo kategorii" aria-busy={loading}>
        {tree.map((node) => (
          <CategoryTreeItem key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggle} {...actions} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <PageHeader
        title="Kategorie"
        description="Hierarchia kategorii sklepu. Rodzeństwo jest sortowane alfabetycznie."
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => {
              open({ kind: 'create', parent: null });
            }}
          >
            Dodaj kategorię główną
          </Button>
        }
      />
      <div className="card">
        <div className="toolbar toolbar--compact">
          <p className="toolbar__summary">
            {tree === undefined ? 'Wczytywanie…' : `${String(options.length)} kategorii`}
          </p>
          <div className="toolbar__filters">
            <Button
              size="sm"
              variant="ghost"
              icon="expand"
              disabled={tree === undefined}
              onClick={() => {
                setCollapsed(new Set());
              }}
            >
              Rozwiń wszystko
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="collapse"
              disabled={tree === undefined}
              onClick={() => {
                setCollapsed(new Set(idsWithChildren(tree ?? [])));
              }}
            >
              Zwiń wszystko
            </Button>
          </div>
        </div>
        {content}
      </div>
      <div className="page-note">
        <Alert tone="info">
          Reguły drzewa sprawdza backend: nie można przenieść kategorii do jej podkategorii (cykl), przekroczyć 10 poziomów
          zagnieżdżenia ani usunąć kategorii, która ma produkty lub podkategorie.
        </Alert>
      </div>

      {dialog?.kind === 'create' && (
        <CategoryFormDialog
          key={dialogKey}
          open
          title={dialog.parent === null ? 'Nowa kategoria główna' : 'Nowa podkategoria'}
          description={dialog.parent === null ? undefined : `W kategorii „${dialog.parent.name}”.`}
          submitLabel="Dodaj kategorię"
          onSubmit={(input) => create(dialog.parent, input)}
          onClose={close}
        />
      )}
      {dialog?.kind === 'edit' && (
        <CategoryFormDialog
          key={dialogKey}
          open
          title="Edytuj kategorię"
          initialValues={{ name: dialog.node.name, slug: dialog.node.slug }}
          submitLabel="Zapisz zmiany"
          onSubmit={(input) => edit(dialog.node, input)}
          onClose={close}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveCategoryDialog
          key={dialogKey}
          open
          category={dialog.node}
          options={options}
          onMove={(parentId) => move(dialog.node, parentId)}
          onClose={close}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          key={dialogKey}
          open
          title="Usunąć kategorię?"
          confirmLabel="Usuń kategorię"
          tone="danger"
          onConfirm={() => remove(dialog.node)}
          onClose={close}
        >
          Kategoria „{dialog.node.name}” zostanie trwale usunięta. Kategorii z produktami lub podkategoriami nie można usunąć.
        </ConfirmDialog>
      )}
    </>
  );
}
