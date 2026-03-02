export function getScrollStorageKey(): string {
  return `analytics:scroll:${window.location.pathname}`;
}

export function storeScrollPosition(): void {
  try {
    window.sessionStorage.setItem(getScrollStorageKey(), String(window.scrollY));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to store scroll position', error);
  }
}

export function restoreScrollPosition(): void {
  try {
    const raw = window.sessionStorage.getItem(getScrollStorageKey());
    if (!raw) {
      return;
    }
    window.sessionStorage.removeItem(getScrollStorageKey());
    const scrollY = Number(raw);
    if (Number.isFinite(scrollY)) {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to restore scroll position', error);
  }
}

export function clearLocationHash(): void {
  if (!window.location.hash) {
    return;
  }
  if (typeof window.history.replaceState !== 'function') {
    return;
  }
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to clear URL hash', error);
  }
}

export function getAnalyticsFiltersForm(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>('form[data-analytics-filters="true"]');
}

export function setHiddenInput(form: HTMLFormElement, name: string, value: string): void {
  let input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    form.appendChild(input);
  }
  input.value = value;
}

export function initAutoSubmitForms(): void {
  const forms = document.querySelectorAll<HTMLFormElement>('form[data-auto-submit="true"]');
  forms.forEach(form => {
    if (form.dataset.autoSubmitBound === 'true') {
      return;
    }
    form.addEventListener('change', event => {
      const target = event.target;
      if (target instanceof HTMLInputElement && (target.type === 'radio' || target.type === 'checkbox')) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.submit();
        }
      }
    });
    form.dataset.autoSubmitBound = 'true';
  });
}

export function normaliseMultiSelectSelections(form: HTMLFormElement): void {
  const groups = form.querySelectorAll<HTMLDetailsElement>('[data-module="analytics-multiselect"]');
  groups.forEach(details => {
    const items = Array.from(details.querySelectorAll<HTMLInputElement>('[data-multiselect-item]'));
    if (items.length === 0) {
      return;
    }
    const checkedItems = items.filter(item => item.checked);
    if (checkedItems.length !== items.length) {
      return;
    }
    items.forEach(item => {
      item.checked = false;
    });
    const selectAll = details.querySelector<HTMLInputElement>('[data-select-all]');
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }
  });
}

export function initFilterPersistence(): void {
  const forms = document.querySelectorAll<HTMLFormElement>('form[data-analytics-filters="true"]');
  forms.forEach(form => {
    if (form.dataset.analyticsFiltersBound === 'true') {
      return;
    }
    form.addEventListener('submit', () => {
      if (!form.dataset.ajaxSection) {
        clearLocationHash();
      }
      normaliseMultiSelectSelections(form);
    });
    form.dataset.analyticsFiltersBound = 'true';
  });
}

export function initFacetedFilterAutoRefresh(
  refreshSharedFilters: (form: HTMLFormElement, changedFilter: string) => Promise<void>
): void {
  const forms = document.querySelectorAll<HTMLFormElement>('form[data-analytics-filters="true"]');
  forms.forEach(form => {
    const multiselects = form.querySelectorAll<HTMLDetailsElement>('details[data-module="analytics-multiselect"]');
    multiselects.forEach(details => {
      if (details.dataset.facetRefreshBound === 'true') {
        return;
      }
      const changedFilter = details.dataset.filterKey;
      if (!changedFilter) {
        return;
      }

      let hasSelectionChanges = false;
      let refreshInFlight = false;
      const triggerRefreshIfNeeded = () => {
        if (!hasSelectionChanges || refreshInFlight) {
          return;
        }
        hasSelectionChanges = false;
        refreshInFlight = true;
        void refreshSharedFilters(form, changedFilter).finally(() => {
          refreshInFlight = false;
        });
      };

      details.addEventListener('change', event => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        if (!target.hasAttribute('data-multiselect-item') && !target.hasAttribute('data-select-all')) {
          return;
        }
        hasSelectionChanges = true;
      });

      details.addEventListener('toggle', () => {
        if (details.open) {
          hasSelectionChanges = false;
          return;
        }
        triggerRefreshIfNeeded();
      });

      details.addEventListener('focusout', event => {
        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && details.contains(relatedTarget)) {
          return;
        }
        if (!details.open) {
          triggerRefreshIfNeeded();
        }
      });

      details.dataset.facetRefreshBound = 'true';
    });
  });
}

export function initMultiSelects(): void {
  const nodes = document.querySelectorAll<HTMLDetailsElement>('[data-module="analytics-multiselect"]');
  nodes.forEach(details => {
    if (details.dataset.multiselectBound === 'true') {
      return;
    }
    const summary = details.querySelector<HTMLElement>('[data-multiselect-summary]');
    const selectAll = details.querySelector<HTMLInputElement>('[data-select-all]');
    const items = Array.from(details.querySelectorAll<HTMLInputElement>('[data-multiselect-item]'));
    const searchInput = details.querySelector<HTMLInputElement>('[data-multiselect-search="true"]');
    const searchCount = details.querySelector<HTMLElement>('[data-multiselect-search-count="true"]');
    const itemEntries = items
      .map(item => {
        const wrapper = item.closest<HTMLElement>('.govuk-checkboxes__item');
        if (!wrapper) {
          return null;
        }
        const label = (item.dataset.itemLabel ?? item.value).toLowerCase();
        return { item, wrapper, label };
      })
      .filter((entry): entry is { item: HTMLInputElement; wrapper: HTMLElement; label: string } => entry !== null);
    const allText = details.dataset.allText ?? 'All';

    const getSelectableItems = () => {
      if (!searchInput) {
        return itemEntries;
      }
      const term = searchInput.value.trim().toLowerCase();
      if (!term) {
        return itemEntries;
      }
      return itemEntries.filter(entry => entry.wrapper.style.display !== 'none');
    };

    const updateSearch = () => {
      if (!searchInput) {
        return;
      }
      const term = searchInput.value.trim().toLowerCase();
      let visibleCount = 0;
      itemEntries.forEach(entry => {
        const match = term.length === 0 || entry.label.includes(term);
        entry.wrapper.style.display = match ? '' : 'none';
        entry.wrapper.setAttribute('aria-hidden', match ? 'false' : 'true');
        if (match) {
          visibleCount += 1;
        }
      });
      if (searchCount) {
        if (term.length === 0) {
          searchCount.textContent = `${itemEntries.length} options`;
        } else if (visibleCount === 0) {
          searchCount.textContent = 'No matching options';
        } else {
          searchCount.textContent = `${visibleCount} of ${itemEntries.length} options`;
        }
      }
    };

    const updateSummary = () => {
      if (!summary) {
        return;
      }
      const checkedItems = items.filter(item => item.checked);
      if (checkedItems.length === 0) {
        summary.textContent = allText;
        return;
      }
      if (checkedItems.length === items.length) {
        if (checkedItems.length === 1) {
          summary.textContent = checkedItems[0]?.dataset.itemLabel ?? checkedItems[0]?.value ?? allText;
          return;
        }
        summary.textContent = allText;
        return;
      }
      if (checkedItems.length === 1) {
        summary.textContent = checkedItems[0]?.dataset.itemLabel ?? checkedItems[0]?.value ?? allText;
        return;
      }
      summary.textContent = `${checkedItems.length} selected`;
    };

    const updateSelectAllState = () => {
      if (!selectAll) {
        return;
      }
      const selectable = getSelectableItems();
      const checkedCount = selectable.filter(entry => entry.item.checked).length;
      selectAll.checked = selectable.length > 0 && checkedCount === selectable.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < selectable.length;
    };

    const updateAll = () => {
      updateSelectAllState();
      updateSummary();
    };

    if (selectAll) {
      selectAll.addEventListener('change', () => {
        const shouldCheck = selectAll.checked;
        const selectable = getSelectableItems();
        selectable.forEach(entry => {
          entry.item.checked = shouldCheck;
        });
        updateAll();
      });
    }

    items.forEach(item => {
      item.addEventListener('change', updateAll);
    });

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        updateSearch();
        updateAll();
      });
    }

    details.addEventListener('keydown', event => {
      if (event.key !== 'Escape') {
        return;
      }
      details.open = false;
      details.querySelector<HTMLElement>('summary')?.focus();
    });

    details.addEventListener('toggle', () => {
      updateAll();
    });

    const isEventInsideDetails = (event: Event): boolean => {
      if (typeof event.composedPath === 'function') {
        return event.composedPath().includes(details);
      }
      const target = event.target;
      return target instanceof Node && details.contains(target);
    };

    const closeIfClickOutside = (event: Event) => {
      if (!details.open) {
        return;
      }
      if (!isEventInsideDetails(event)) {
        details.open = false;
      }
    };

    document.addEventListener('pointerdown', closeIfClickOutside, true);
    document.addEventListener('click', closeIfClickOutside, true);

    updateSearch();
    updateAll();
    details.dataset.multiselectBound = 'true';
  });
}
