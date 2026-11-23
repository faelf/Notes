import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FilePlus,
  FolderPlus,
  RefreshCw,
  Pencil,
  Trash2,
  Search,
  X,
} from 'lucide-react';

function filterTree(nodes, query) {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const result = [];

  for (const node of nodes) {
    if (node.type === 'folder') {
      const folderMatches = node.name.toLowerCase().includes(q);
      const filteredChildren = filterTree(node.children || [], query);
      if (folderMatches || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: folderMatches ? node.children : filteredChildren,
        });
      }
    } else if (
      node.name.toLowerCase().includes(q) ||
      node.path.toLowerCase().includes(q)
    ) {
      result.push(node);
    }
  }
  return result;
}

function countFiles(nodes) {
  let total = 0;
  for (const node of nodes) {
    if (node.type === 'file') total++;
    else if (node.children) total += countFiles(node.children);
  }
  return total;
}

function TreeNode({
  node,
  depth,
  activePath,
  expandedFolders,
  forceExpand,
  onToggleFolder,
  onSelectFile,
  onNewFileIn,
  onNewFolderIn,
  onRename,
  onDelete,
}) {
  const isFolder = node.type === 'folder';
  const isExpanded = forceExpand || expandedFolders.has(node.path);
  const isActive = !isFolder && node.path === activePath;
  const paddingLeft = 8 + depth * 15;

  return (
    <>
      <div
        className={`tree-row${isActive ? ' active' : ''}`}
        style={{ paddingLeft }}
        onClick={() => (isFolder ? onToggleFolder(node.path) : onSelectFile(node.path))}
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        aria-selected={isActive}
        title={node.path}
      >
        {isFolder ? (
          <>
            <span className="tree-chevron">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            {isExpanded ? (
              <FolderOpen size={15} className="tree-icon" />
            ) : (
              <Folder size={15} className="tree-icon" />
            )}
          </>
        ) : (
          <>
            <span className="tree-chevron" />
            <FileText size={15} className="tree-icon" />
          </>
        )}

        <span className="tree-label">{isFolder ? node.name : node.title}</span>

        <div
          className="tree-row-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {isFolder && (
            <>
              <button
                type="button"
                className="icon-btn sm"
                title={`New note in ${node.name}`}
                onClick={() => onNewFileIn(node.path)}
              >
                <FilePlus size={13} />
              </button>
              <button
                type="button"
                className="icon-btn sm"
                title={`New folder in ${node.name}`}
                onClick={() => onNewFolderIn(node.path)}
              >
                <FolderPlus size={13} />
              </button>
            </>
          )}
          <button
            type="button"
            className="icon-btn sm"
            title={`Rename ${node.name}`}
            onClick={() => onRename(node)}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="icon-btn sm danger"
            title={`Delete ${node.name}`}
            onClick={() => onDelete(node)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {isFolder &&
        isExpanded &&
        (node.children || []).map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            expandedFolders={expandedFolders}
            forceExpand={forceExpand}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
            onNewFileIn={onNewFileIn}
            onNewFolderIn={onNewFolderIn}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

export function Sidebar({
  open,
  folderName,
  tree,
  activePath,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onRefresh,
  onCloseMobile,
}) {
  const [filterQuery, setFilterQuery] = useState('');

  const filteredTree = useMemo(() => filterTree(tree, filterQuery.trim()), [tree, filterQuery]);
  const totalNotes = useMemo(() => countFiles(tree), [tree]);

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
      <aside className={`sidebar${open ? '' : ' collapsed'}`} aria-label="Folder explorer">
        <div className="sidebar-top">
          <div className="sidebar-folder-header" title={folderName || 'Folder'}>
            <Folder size={14} className="sidebar-folder-icon" />
            <span className="sidebar-title-text">{folderName || 'Folder'}</span>
          </div>
          <div className="sidebar-actions">
            <button
              type="button"
              className="icon-btn sm"
              onClick={() => onNewFile('')}
              title="New note"
              aria-label="New note"
            >
              <FilePlus size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              onClick={() => onNewFolder('')}
              title="New folder"
              aria-label="New folder"
            >
              <FolderPlus size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              onClick={onRefresh}
              title="Refresh folder"
              aria-label="Refresh folder"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="sidebar-filter">
          <div className="filter-input-wrap">
            <Search size={13} className="filter-input-icon" />
            <input
              type="text"
              className="filter-input"
              placeholder="Filter files…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
            {filterQuery && (
              <button
                type="button"
                className="filter-clear-btn"
                onClick={() => setFilterQuery('')}
                aria-label="Clear filter"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="tree-scroll" role="tree">
          {filteredTree.length === 0 ? (
            filterQuery ? (
              <div className="tree-empty">No matching files.</div>
            ) : (
              <div className="tree-empty tree-empty-state">
                <FolderOpen size={22} className="tree-empty-icon" />
                <div className="tree-empty-title">This folder is empty</div>
                <div className="tree-empty-subtitle">Create a note to begin</div>
              </div>
            )
          ) : (
            filteredTree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                activePath={activePath}
                expandedFolders={expandedFolders}
                forceExpand={Boolean(filterQuery.trim())}
                onToggleFolder={onToggleFolder}
                onSelectFile={onSelectFile}
                onNewFileIn={onNewFile}
                onNewFolderIn={onNewFolder}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <span>
            {totalNotes} {totalNotes === 1 ? 'note' : 'notes'}
          </span>
          <span>Local container</span>
        </div>
      </aside>
    </>
  );
}
