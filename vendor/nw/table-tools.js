/*!
 * Table editing for the document's rich-text fields.
 * Uses a logical cell grid so operations also work with rowspan/colspan.
 * Selection is temporary UI state; strip nw-cell-selected before serialization.
 */
(function (global) {
  'use strict';

  var api = {};
  var rootEl = null;
  var change = function () {};
  var toast = function () {};
  var selected = [];
  var anchor = null;
  var active = null;
  var installedRoots = [];
  var SELECTED = 'nw-cell-selected';
  var ACTIONS = ['merge', 'split', 'row+', 'row-', 'col+', 'col-'];

  function array(list) { return Array.prototype.slice.call(list || []); }
  function cellOf(node) {
    if (node && node.nodeType === 3) node = node.parentNode;
    return node && node.closest ? node.closest('td,th') : null;
  }
  function tableOf(cell) { return cell && cell.closest ? cell.closest('table') : null; }
  function editableTable(table) {
    return !!(table && table.closest('[contenteditable="true"]'));
  }
  function directCells(row, table) {
    return array(row.cells).filter(function (cell) { return tableOf(cell) === table; });
  }
  function span(cell, key, limit) {
    var value = parseInt(cell.getAttribute(key), 10);
    if (key === 'rowspan' && value === 0) return limit;
    return Math.min(limit, Math.max(1, isFinite(value) ? value : 1));
  }
  function setSpan(cell, key, value) {
    if (value > 1) cell.setAttribute(key, String(value));
    else cell.removeAttribute(key);
  }

  /* HTML row spans stop at the end of their own thead/tbody/tfoot. */
  function grid(table) {
    var rows = array(table.rows).filter(function (row) { return row.closest('table') === table; });
    var slots = rows.map(function () { return []; });
    var entries = [];
    var width = 0;
    rows.forEach(function (row, r) {
      var groupEnd = r + 1;
      while (groupEnd < rows.length && rows[groupEnd].parentNode === row.parentNode) groupEnd++;
      var c = 0;
      directCells(row, table).forEach(function (cell) {
        while (slots[r][c]) c++;
        var entry = {
          cell: cell, row: r, col: c,
          rows: span(cell, 'rowspan', groupEnd - r),
          cols: span(cell, 'colspan', 1000),
          group: row.parentNode
        };
        entries.push(entry);
        for (var rr = r; rr < r + entry.rows; rr++) {
          for (var cc = c; cc < c + entry.cols; cc++) slots[rr][cc] = entry;
        }
        c += entry.cols;
        width = Math.max(width, c);
      });
    });
    return { table: table, rows: rows, slots: slots, entries: entries, width: width };
  }
  function entryOf(layout, cell) {
    for (var i = 0; i < layout.entries.length; i++) {
      if (layout.entries[i].cell === cell) return layout.entries[i];
    }
    return null;
  }
  function bounds(entries) {
    if (!entries.length) return null;
    var box = { top: Infinity, left: Infinity, bottom: -1, right: -1 };
    entries.forEach(function (entry) {
      box.top = Math.min(box.top, entry.row);
      box.left = Math.min(box.left, entry.col);
      box.bottom = Math.max(box.bottom, entry.row + entry.rows - 1);
      box.right = Math.max(box.right, entry.col + entry.cols - 1);
    });
    return box;
  }
  function intersects(entry, box) {
    return entry.row <= box.bottom && entry.row + entry.rows > box.top &&
      entry.col <= box.right && entry.col + entry.cols > box.left;
  }
  function paint(cells) {
    selected.forEach(function (cell) { cell.classList.remove(SELECTED); });
    selected = cells.filter(function (cell, i) { return cells.indexOf(cell) === i; });
    selected.forEach(function (cell) { cell.classList.add(SELECTED); });
  }
  function clear() {
    paint([]);
    if (rootEl) array(rootEl.querySelectorAll('.' + SELECTED)).forEach(function (cell) {
      cell.classList.remove(SELECTED);
    });
    anchor = null;
    active = null;
  }
  function focusCell(cell) {
    if (!cell || !cell.isConnected) return;
    var host = cell.closest('[contenteditable="true"]');
    if (host) host.focus({ preventScroll: true });
    var range = cell.ownerDocument.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    var selection = global.getSelection();
    if (selection) { selection.removeAllRanges(); selection.addRange(range); }
    active = anchor = cell;
    if (global.NWE && global.NWE.saveSelection) global.NWE.saveSelection();
  }
  function afterChange(cell) {
    clear();
    focusCell(cell);
    change(cell && cell.closest('[contenteditable="true"]'));
  }
  function newCell(table, tag) {
    var cell = table.ownerDocument.createElement(tag || 'td');
    cell.innerHTML = '<br>';
    return cell;
  }
  function insertAt(row, cell, col, layout) {
    var next = layout.entries.filter(function (entry) {
      return entry.cell.parentNode === row && entry.col > col;
    }).sort(function (a, b) { return a.col - b.col; })[0];
    row.insertBefore(cell, next ? next.cell : null);
  }
  function nearestCell(layout, row, col) {
    var r = Math.max(0, Math.min(row, layout.rows.length - 1));
    var c = Math.max(0, Math.min(col, layout.width - 1));
    if (layout.slots[r] && layout.slots[r][c]) return layout.slots[r][c].cell;
    return layout.entries.length ? layout.entries[0].cell : null;
  }

  function selectRange(first, last) {
    var table = tableOf(first);
    var layout = grid(table);
    var a = entryOf(layout, first), b = entryOf(layout, last);
    if (!a || !b) return;
    var box = bounds([a, b]);
    /* Include whole merged cells whenever the rectangle intersects their span. */
    var changed = true;
    while (changed) {
      changed = false;
      layout.entries.forEach(function (entry) {
        if (!intersects(entry, box)) return;
        var larger = bounds([entry, {
          row: box.top, col: box.left,
          rows: box.bottom - box.top + 1, cols: box.right - box.left + 1
        }]);
        if (larger.top !== box.top || larger.left !== box.left ||
            larger.bottom !== box.bottom || larger.right !== box.right) {
          box = larger;
          changed = true;
        }
      });
    }
    paint(layout.entries.filter(function (entry) { return intersects(entry, box); }).map(function (entry) {
      return entry.cell;
    }));
  }
  function onMouseDown(event) {
    if (event.button !== 0) return;
    var cell = cellOf(event.target);
    var table = tableOf(cell);
    if (!cell || !rootEl.contains(cell) || !editableTable(table)) {
      clear();
      return;
    }
    if (!anchor || !anchor.isConnected || tableOf(anchor) !== table) {
      paint([]);
      anchor = cell;
    }
    active = cell;
    if (event.shiftKey) {
      event.preventDefault();
      var oldAnchor = anchor;
      selectRange(anchor, cell);
      focusCell(cell);
      anchor = oldAnchor;
    } else if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      var index = selected.indexOf(cell);
      var cells = selected.slice();
      if (index >= 0) cells.splice(index, 1);
      else cells.push(cell);
      var ctrlAnchor = anchor;
      paint(cells);
      focusCell(cell);
      anchor = ctrlAnchor;
    } else {
      anchor = cell;
      paint([cell]);
    }
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') clear();
  }

  function merge(layout, current) {
    var cells = selected.filter(function (cell) { return cell.isConnected && tableOf(cell) === layout.table; });
    if (cells.length < 2) {
      toast('Shift 키를 누른 채 첫 칸과 마지막 칸을 클릭해 병합할 영역을 선택하세요.');
      return;
    }
    var entries = cells.map(function (cell) { return entryOf(layout, cell); }).filter(Boolean);
    var box = bounds(entries);
    var group = entries[0].group;
    if (entries.some(function (entry) { return entry.group !== group; })) {
      toast('제목 영역과 본문 영역을 가로질러 병합할 수 없습니다. 같은 영역의 칸을 선택하세요.');
      return;
    }
    for (var r = box.top; r <= box.bottom; r++) {
      for (var c = box.left; c <= box.right; c++) {
        var slot = layout.slots[r][c];
        if (!slot || cells.indexOf(slot.cell) < 0) {
          toast('병합할 칸은 빈틈없는 직사각형으로 선택해야 합니다.');
          return;
        }
      }
    }
    var keeper = layout.slots[box.top][box.left].cell;
    entries.sort(function (a, b) { return a.row - b.row || a.col - b.col; });
    var content = [];
    entries.forEach(function (entry) {
      var clone = entry.cell.cloneNode(true);
      clone.classList.remove(SELECTED);
      /* Remove empty placeholder paragraphs, but retain images and custom blocks. */
      if (clone.textContent.replace(/\u00a0/g, ' ').trim() ||
          clone.querySelector('img,iframe,table,hr,[data-nw]')) {
        var html = clone.innerHTML;
        content.push(clone.querySelector('p,div,ul,ol,blockquote,pre,table,hr,details') ? html : '<p>' + html + '</p>');
      }
    });
    keeper.innerHTML = content.length ? content.join('') : '<br>';
    setSpan(keeper, 'rowspan', box.bottom - box.top + 1);
    setSpan(keeper, 'colspan', box.right - box.left + 1);
    entries.forEach(function (entry) { if (entry.cell !== keeper) entry.cell.remove(); });
    afterChange(keeper);
    toast('선택한 칸을 병합했습니다.');
  }

  function split(layout, current) {
    var cells = selected.filter(function (cell) { return cell.isConnected && tableOf(cell) === layout.table; });
    if (!cells.length) cells = [current.cell];
    var entries = cells.map(function (cell) { return entryOf(layout, cell); }).filter(Boolean);
    var expanded = false;
    /* New cells are inserted using original logical columns, including other split cells. */
    entries.sort(function (a, b) { return a.row - b.row || a.col - b.col; }).forEach(function (entry) {
      if (entry.rows === 1 && entry.cols === 1) return;
      expanded = true;
      setSpan(entry.cell, 'rowspan', 1);
      setSpan(entry.cell, 'colspan', 1);
      for (var r = entry.row; r < entry.row + entry.rows; r++) {
        for (var c = entry.col; c < entry.col + entry.cols; c++) {
          if (r === entry.row && c === entry.col) continue;
          var cell = newCell(layout.table, entry.cell.tagName.toLowerCase());
          if (entry.cell.getAttribute('style')) cell.setAttribute('style', entry.cell.getAttribute('style'));
          insertAt(layout.rows[r], cell, c, layout);
          layout.entries.push({ cell: cell, row: r, col: c, rows: 1, cols: 1, group: entry.group });
        }
      }
    });
    if (!expanded) { toast('병합된 칸을 선택하면 나눌 수 있습니다.'); return; }
    afterChange(current.cell);
    toast('병합을 해제했습니다. 내용은 왼쪽 위 칸에 유지됩니다.');
  }

  function addRow(layout, current) {
    var position = current.row + current.rows;
    var row = layout.table.ownerDocument.createElement('tr');
    var crossing = layout.entries.filter(function (entry) {
      return entry.group === current.group && entry.row < position && entry.row + entry.rows > position;
    });
    crossing.forEach(function (entry) { setSpan(entry.cell, 'rowspan', entry.rows + 1); });
    for (var c = 0; c < layout.width; c++) {
      if (crossing.some(function (entry) { return c >= entry.col && c < entry.col + entry.cols; })) continue;
      row.appendChild(newCell(layout.table, current.group.tagName === 'THEAD' ? 'th' : 'td'));
    }
    var next = layout.rows[position];
    current.group.insertBefore(row, next && next.parentNode === current.group ? next : null);
    afterChange(nearestCell(grid(layout.table), position, current.col));
  }

  function deleteRow(layout, current) {
    if (layout.rows.length <= 1) { toast('행이 하나뿐이어서 삭제할 수 없습니다.'); return; }
    var position = current.row;
    var next = layout.rows[position + 1];
    layout.entries.forEach(function (entry) {
      if (entry.row < position && entry.row + entry.rows > position) {
        setSpan(entry.cell, 'rowspan', entry.rows - 1);
      }
    });
    layout.entries.filter(function (entry) {
      return entry.row === position && entry.rows > 1;
    }).sort(function (a, b) { return a.col - b.col; }).forEach(function (entry) {
      setSpan(entry.cell, 'rowspan', entry.rows - 1);
      insertAt(next, entry.cell, entry.col, layout);
    });
    layout.rows[position].remove();
    afterChange(nearestCell(grid(layout.table), position, current.col));
  }

  function addColumn(layout, current) {
    var position = current.col + current.cols;
    var crossing = layout.entries.filter(function (entry) {
      return entry.col < position && entry.col + entry.cols > position;
    });
    crossing.forEach(function (entry) { setSpan(entry.cell, 'colspan', entry.cols + 1); });
    layout.rows.forEach(function (row, r) {
      if (crossing.some(function (entry) { return r >= entry.row && r < entry.row + entry.rows; })) return;
      var own = directCells(row, layout.table);
      var head = row.parentNode.tagName === 'THEAD' || (own.length && own.every(function (cell) { return cell.tagName === 'TH'; }));
      var cell = newCell(layout.table, head ? 'th' : 'td');
      /* At the insertion boundary, existing cells start at position and must move right. */
      var next = layout.entries.filter(function (entry) {
        return entry.cell.parentNode === row && entry.col >= position;
      }).sort(function (a, b) { return a.col - b.col; })[0];
      row.insertBefore(cell, next ? next.cell : null);
    });
    afterChange(nearestCell(grid(layout.table), current.row, position));
  }

  function deleteColumn(layout, current) {
    if (layout.width <= 1) { toast('열이 하나뿐이어서 삭제할 수 없습니다.'); return; }
    var position = current.col;
    layout.entries.forEach(function (entry) {
      if (entry.col <= position && entry.col + entry.cols > position) {
        if (entry.cols > 1) setSpan(entry.cell, 'colspan', entry.cols - 1);
        else entry.cell.remove();
      }
    });
    afterChange(nearestCell(grid(layout.table), current.row, position));
  }

  api.init = function (options) {
    if (options && options.nodeType === 1) options = { root: options };
    options = options || {};
    if (!options.root) return api;
    if (rootEl && rootEl !== options.root) clear();
    rootEl = options.root;
    change = options.onChange || change;
    toast = options.onToast || toast;
    /* Delegation survives replacing the document's innerHTML. */
    if (installedRoots.indexOf(rootEl) < 0) {
      rootEl.addEventListener('mousedown', onMouseDown);
      rootEl.addEventListener('keydown', onKeyDown);
      installedRoots.push(rootEl);
    }
    if (anchor && !anchor.isConnected) clear();
    return api;
  };
  api.clearSelection = clear;
  api.selection = function () {
    return selected.filter(function (cell) { return cell.isConnected; }).slice();
  };
  api.activeCell = function () { return active && active.isConnected ? active : null; };
  api.command = function (action, cell) {
    if (ACTIONS.indexOf(action) < 0) return false;
    cell = cellOf(cell) || api.activeCell();
    var table = tableOf(cell);
    if (!cell || !table) { toast('표 안의 칸을 먼저 선택하세요.'); return true; }
    if (!editableTable(table)) {
      toast('프로필 표의 행 구성은 왼쪽 프로필 탭에서 변경할 수 있습니다. 본문에 넣은 표를 선택하세요.');
      return true;
    }
    var layout = grid(table), current = entryOf(layout, cell);
    if (!current) return true;
    if (action === 'merge') merge(layout, current);
    else if (action === 'split') split(layout, current);
    else if (action === 'row+') addRow(layout, current);
    else if (action === 'row-') deleteRow(layout, current);
    else if (action === 'col+') addColumn(layout, current);
    else if (action === 'col-') deleteColumn(layout, current);
    return true;
  };
  /* Logical grid is also useful to inspect a table before a custom operation. */
  api.grid = grid;
  global.NWTables = api;
})(typeof self !== 'undefined' ? self : this);

