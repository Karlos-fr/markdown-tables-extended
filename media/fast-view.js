(function () {
  const ROW_HEIGHT = 30;
  const OVERSCAN = 16;
  const MAX_FILTER_VALUES = 500;
  const MIN_COLUMN_WIDTH = 64;

  const data = JSON.parse(document.getElementById("mte-data").textContent);
  const tableSelect = document.getElementById("tableSelect");
  const summary = document.getElementById("summary");
  const header = document.getElementById("header");
  const viewport = document.getElementById("viewport");
  const spacer = document.getElementById("spacer");
  const rowsLayer = document.getElementById("rows");

  let currentTableIndex = 0;
  let columnWidths = [];
  let sort = null;
  let filters = new Map();
  let viewRows = [];
  let activePopover = null;

  data.tables.forEach((table, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = table.title + " - " + table.rows.length + " rows";
    tableSelect.appendChild(option);
  });

  tableSelect.addEventListener("change", () => {
    currentTableIndex = Number(tableSelect.value);
    sort = null;
    filters = new Map();
    closePopover();
    initializeTable();
  });

  viewport.addEventListener("scroll", renderRows);
  window.addEventListener("resize", renderRows);

  initializeTable();

  function initializeTable() {
    const table = getTable();
    columnWidths = table.headers.map((headerText, index) => {
      const contentLength = Math.max(
        headerText.length,
        ...table.rows.slice(0, 250).map((row) => String(row[index] || "").length)
      );
      return Math.min(420, Math.max(110, contentLength * 8 + 42));
    });

    applyState();
    renderHeader();
  }

  function getTable() {
    return data.tables[currentTableIndex];
  }

  function getGridTemplate() {
    return columnWidths.map((width) => width + "px").join(" ");
  }

  function applyState() {
    const table = getTable();
    viewRows = table.rows.filter((row) => {
      for (const [columnIndex, allowed] of filters.entries()) {
        if (!allowed.has(String(row[columnIndex] || ""))) {
          return false;
        }
      }
      return true;
    });

    if (sort) {
      const multiplier = sort.direction === "asc" ? 1 : -1;
      viewRows = [...viewRows].sort((left, right) => {
        return String(left[sort.columnIndex] || "").localeCompare(String(right[sort.columnIndex] || ""), undefined, {
          numeric: true,
          sensitivity: "base"
        }) * multiplier;
      });
    }

    spacer.style.height = viewRows.length * ROW_HEIGHT + "px";
    rowsLayer.style.width = columnWidths.reduce((total, width) => total + width, 0) + "px";
    summary.textContent = viewRows.length + " visible rows / " + table.rows.length + " rows";
    renderHeader();
    renderRows();
  }

  function renderHeader() {
    const table = getTable();
    header.replaceChildren();
    header.style.gridTemplateColumns = getGridTemplate();

    table.headers.forEach((label, columnIndex) => {
      const cell = document.createElement("div");
      cell.className = "headerCell";

      const text = document.createElement("span");
      text.className = "headerLabel";
      text.textContent = label;
      text.title = label;
      text.addEventListener("click", () => toggleSort(columnIndex));

      const sortButton = document.createElement("button");
      sortButton.className = "sortButton";
      sortButton.textContent = sort?.columnIndex === columnIndex ? (sort.direction === "asc" ? "\u2191" : "\u2193") : "\u21c5";
      sortButton.title = "Sort";
      sortButton.addEventListener("click", () => toggleSort(columnIndex));

      const filterButton = document.createElement("button");
      filterButton.className = "filterButton";
      filterButton.textContent = "\u25be";
      filterButton.title = "Filter";
      filterButton.addEventListener("click", (event) => openFilter(columnIndex, filterButton, event));

      const resizeHandle = document.createElement("span");
      resizeHandle.className = "resizeHandle";
      resizeHandle.addEventListener("mousedown", (event) => startResize(columnIndex, event));

      cell.append(text, sortButton, filterButton, resizeHandle);
      header.appendChild(cell);
    });
  }

  function renderRows() {
    const viewportHeight = viewport.clientHeight;
    const scrollTop = viewport.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(viewRows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    const template = getGridTemplate();

    rowsLayer.replaceChildren();

    for (let index = start; index < end; index += 1) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.top = index * ROW_HEIGHT + "px";
      row.style.gridTemplateColumns = template;

      viewRows[index].forEach((value) => {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.textContent = value;
        cell.title = value;
        row.appendChild(cell);
      });

      rowsLayer.appendChild(row);
    }
  }

  function toggleSort(columnIndex) {
    if (!sort || sort.columnIndex !== columnIndex) {
      sort = { columnIndex, direction: "asc" };
    } else if (sort.direction === "asc") {
      sort = { columnIndex, direction: "desc" };
    } else {
      sort = null;
    }

    applyState();
  }

  function openFilter(columnIndex, anchor, event) {
    event.stopPropagation();
    closePopover();

    const table = getTable();
    const values = Array.from(new Set(table.rows.map((row) => String(row[columnIndex] || ""))))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    const selected = new Set(filters.get(columnIndex) || values);

    const popover = document.createElement("div");
    popover.className = "filterPopover";

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search...";

    const list = document.createElement("div");
    list.className = "filterValues";

    const renderValues = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const matches = values.filter((value) => value.toLocaleLowerCase().includes(query));
      list.replaceChildren();

      matches.slice(0, MAX_FILTER_VALUES).forEach((value) => {
        const label = document.createElement("label");
        label.className = "filterOption";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected.has(value);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selected.add(value);
          } else {
            selected.delete(value);
          }
        });

        const text = document.createElement("span");
        text.textContent = value || "(empty)";
        label.append(checkbox, text);
        list.appendChild(label);
      });
    };

    const clear = document.createElement("button");
    clear.textContent = "Clear";
    clear.addEventListener("click", () => {
      filters.delete(columnIndex);
      closePopover();
      applyState();
    });

    const apply = document.createElement("button");
    apply.textContent = "Apply";
    apply.addEventListener("click", () => {
      if (selected.size === values.length) {
        filters.delete(columnIndex);
      } else {
        filters.set(columnIndex, selected);
      }
      closePopover();
      applyState();
    });

    const actions = document.createElement("div");
    actions.className = "filterActions";
    actions.append(clear, apply);
    search.addEventListener("input", renderValues);
    popover.append(search, list, actions);
    document.body.appendChild(popover);

    const rect = anchor.getBoundingClientRect();
    popover.style.left = Math.min(rect.left, window.innerWidth - 320) + "px";
    popover.style.top = rect.bottom + 6 + "px";

    activePopover = popover;
    renderValues();
    search.focus();
  }

  function closePopover() {
    activePopover?.remove();
    activePopover = null;
  }

  function startResize(columnIndex, event) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidths[columnIndex];

    function onMouseMove(moveEvent) {
      columnWidths[columnIndex] = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
      renderHeader();
      renderRows();
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
    }

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
  }

  document.addEventListener("click", (event) => {
    if (activePopover && !activePopover.contains(event.target)) {
      closePopover();
    }
  });
})();
