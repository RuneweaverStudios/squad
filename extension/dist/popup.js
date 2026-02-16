import { i as is_array, g as get_prototype_of, o as object_prototype, c as create_text, b as block, a as get, d as internal_set, e as current_batch, f as branch, s as should_defer_append, h as derived_safe_equal, E as EACH_ITEM_REACTIVE, j as EACH_ITEM_IMMUTABLE, m as mutable_source, k as source, l as EACH_INDEX_REACTIVE, n as array_from, p as EFFECT_OFFSCREEN, r as resume_effect, q as pause_effect, I as INERT, B as BRANCH_EFFECT, t as clear_text_content, u as destroy_effect, v as queue_micro_task, w as get_next_sibling, x as EACH_IS_CONTROLLED, y as EACH_IS_ANIMATED, z as to_style, A as listen_to_event_and_reset_event, C as effect, D as previous_batch, F as select_multiple_invalid_value, G as is, H as teardown, L as LOADING_ATTR_SYMBOL, N as NAMESPACE_HTML, J as get_descriptors, K as untrack, S as STATE_SYMBOL, M as console_log_state, O as delegate, P as check_target, Q as push, R as append_styles, T as tag, U as state, V as user_effect, W as isConfigured, X as set, Y as legacy_api, Z as comment, _ as first_child, $ as add_svelte_meta, a0 as if_block, a1 as append, a2 as pop, a3 as sibling, a4 as child, a5 as template_effect, a6 as set_text, a7 as strict_equals, a8 as apply, a9 as event, aa as bind_value, ab as add_locations, ac as FILENAME, ad as from_html, ae as text, af as track_reactivity_loss, ag as submitFeedback, ah as set_class, ai as user_derived, aj as to_array, ak as tag_proxy, al as proxy, am as mount } from "./supabase.js";
import "./browser-compat.js";
function reset(node) {
  return;
}
var bold = "font-weight: bold";
var normal = "font-weight: normal";
function state_snapshot_uncloneable(properties) {
  {
    console.warn(
      `%c[svelte] state_snapshot_uncloneable
%c${properties ? `The following properties cannot be cloned with \`$state.snapshot\` — the return value contains the originals:

${properties}` : "Value cannot be cloned with `$state.snapshot` — the original value was returned"}
https://svelte.dev/e/state_snapshot_uncloneable`,
      bold,
      normal
    );
  }
}
const empty = [];
function snapshot(value, skip_warning = false, no_tojson = false) {
  if (!skip_warning) {
    const paths = [];
    const copy = clone(value, /* @__PURE__ */ new Map(), "", paths, null, no_tojson);
    if (paths.length === 1 && paths[0] === "") {
      state_snapshot_uncloneable();
    } else if (paths.length > 0) {
      const slice = paths.length > 10 ? paths.slice(0, 7) : paths.slice(0, 10);
      const excess = paths.length - slice.length;
      let uncloned = slice.map((path) => `- <value>${path}`).join("\n");
      if (excess > 0) uncloned += `
- ...and ${excess} more`;
      state_snapshot_uncloneable(uncloned);
    }
    return copy;
  }
  return clone(value, /* @__PURE__ */ new Map(), "", empty, null, no_tojson);
}
function clone(value, cloned, path, paths, original = null, no_tojson = false) {
  if (typeof value === "object" && value !== null) {
    var unwrapped = cloned.get(value);
    if (unwrapped !== void 0) return unwrapped;
    if (value instanceof Map) return (
      /** @type {Snapshot<T>} */
      new Map(value)
    );
    if (value instanceof Set) return (
      /** @type {Snapshot<T>} */
      new Set(value)
    );
    if (is_array(value)) {
      var copy = (
        /** @type {Snapshot<any>} */
        Array(value.length)
      );
      cloned.set(value, copy);
      if (original !== null) {
        cloned.set(original, copy);
      }
      for (var i = 0; i < value.length; i += 1) {
        var element = value[i];
        if (i in value) {
          copy[i] = clone(element, cloned, `${path}[${i}]`, paths, null, no_tojson);
        }
      }
      return copy;
    }
    if (get_prototype_of(value) === object_prototype) {
      copy = {};
      cloned.set(value, copy);
      if (original !== null) {
        cloned.set(original, copy);
      }
      for (var key in value) {
        copy[key] = clone(
          // @ts-expect-error
          value[key],
          cloned,
          `${path}.${key}`,
          paths,
          null,
          no_tojson
        );
      }
      return copy;
    }
    if (value instanceof Date) {
      return (
        /** @type {Snapshot<T>} */
        structuredClone(value)
      );
    }
    if (typeof /** @type {T & { toJSON?: any } } */
    value.toJSON === "function" && !no_tojson) {
      return clone(
        /** @type {T & { toJSON(): any } } */
        value.toJSON(),
        cloned,
        `${path}.toJSON()`,
        paths,
        // Associate the instance with the toJSON clone
        value
      );
    }
  }
  if (value instanceof EventTarget) {
    return (
      /** @type {Snapshot<T>} */
      value
    );
  }
  try {
    return (
      /** @type {Snapshot<T>} */
      structuredClone(value)
    );
  } catch (e) {
    {
      paths.push(path);
    }
    return (
      /** @type {Snapshot<T>} */
      value
    );
  }
}
function index(_, i) {
  return i;
}
function pause_effects(state2, to_destroy, controlled_anchor) {
  var transitions = [];
  var length = to_destroy.length;
  var group;
  var remaining = to_destroy.length;
  for (var i = 0; i < length; i++) {
    let effect2 = to_destroy[i];
    pause_effect(
      effect2,
      () => {
        if (group) {
          group.pending.delete(effect2);
          group.done.add(effect2);
          if (group.pending.size === 0) {
            var groups = (
              /** @type {Set<EachOutroGroup>} */
              state2.outrogroups
            );
            destroy_effects(array_from(group.done));
            groups.delete(group);
            if (groups.size === 0) {
              state2.outrogroups = null;
            }
          }
        } else {
          remaining -= 1;
        }
      },
      false
    );
  }
  if (remaining === 0) {
    var fast_path = transitions.length === 0 && controlled_anchor !== null;
    if (fast_path) {
      var anchor = (
        /** @type {Element} */
        controlled_anchor
      );
      var parent_node = (
        /** @type {Element} */
        anchor.parentNode
      );
      clear_text_content(parent_node);
      parent_node.append(anchor);
      state2.items.clear();
    }
    destroy_effects(to_destroy, !fast_path);
  } else {
    group = {
      pending: new Set(to_destroy),
      done: /* @__PURE__ */ new Set()
    };
    (state2.outrogroups ?? (state2.outrogroups = /* @__PURE__ */ new Set())).add(group);
  }
}
function destroy_effects(to_destroy, remove_dom = true) {
  for (var i = 0; i < to_destroy.length; i++) {
    destroy_effect(to_destroy[i], remove_dom);
  }
}
var offscreen_anchor;
function each(node, flags, get_collection, get_key, render_fn, fallback_fn = null) {
  var anchor = node;
  var items = /* @__PURE__ */ new Map();
  var is_controlled = (flags & EACH_IS_CONTROLLED) !== 0;
  if (is_controlled) {
    var parent_node = (
      /** @type {Element} */
      node
    );
    anchor = parent_node.appendChild(create_text());
  }
  var fallback = null;
  var each_array = derived_safe_equal(() => {
    var collection = get_collection();
    return is_array(collection) ? collection : collection == null ? [] : array_from(collection);
  });
  var array;
  var first_run = true;
  function commit() {
    state2.fallback = fallback;
    reconcile(state2, array, anchor, flags, get_key);
    if (fallback !== null) {
      if (array.length === 0) {
        if ((fallback.f & EFFECT_OFFSCREEN) === 0) {
          resume_effect(fallback);
        } else {
          fallback.f ^= EFFECT_OFFSCREEN;
          move(fallback, null, anchor);
        }
      } else {
        pause_effect(fallback, () => {
          fallback = null;
        });
      }
    }
  }
  var effect2 = block(() => {
    array = /** @type {V[]} */
    get(each_array);
    var length = array.length;
    var keys = /* @__PURE__ */ new Set();
    var batch = (
      /** @type {Batch} */
      current_batch
    );
    var defer = should_defer_append();
    for (var index2 = 0; index2 < length; index2 += 1) {
      var value = array[index2];
      var key = get_key(value, index2);
      var item = first_run ? null : items.get(key);
      if (item) {
        if (item.v) internal_set(item.v, value);
        if (item.i) internal_set(item.i, index2);
        if (defer) {
          batch.skipped_effects.delete(item.e);
        }
      } else {
        item = create_item(
          items,
          first_run ? anchor : offscreen_anchor ?? (offscreen_anchor = create_text()),
          value,
          key,
          index2,
          render_fn,
          flags,
          get_collection
        );
        if (!first_run) {
          item.e.f |= EFFECT_OFFSCREEN;
        }
        items.set(key, item);
      }
      keys.add(key);
    }
    if (length === 0 && fallback_fn && !fallback) {
      if (first_run) {
        fallback = branch(() => fallback_fn(anchor));
      } else {
        fallback = branch(() => fallback_fn(offscreen_anchor ?? (offscreen_anchor = create_text())));
        fallback.f |= EFFECT_OFFSCREEN;
      }
    }
    if (!first_run) {
      if (defer) {
        for (const [key2, item2] of items) {
          if (!keys.has(key2)) {
            batch.skipped_effects.add(item2.e);
          }
        }
        batch.oncommit(commit);
        batch.ondiscard(() => {
        });
      } else {
        commit();
      }
    }
    get(each_array);
  });
  var state2 = { effect: effect2, items, outrogroups: null, fallback };
  first_run = false;
}
function skip_to_branch(effect2) {
  while (effect2 !== null && (effect2.f & BRANCH_EFFECT) === 0) {
    effect2 = effect2.next;
  }
  return effect2;
}
function reconcile(state2, array, anchor, flags, get_key) {
  var is_animated = (flags & EACH_IS_ANIMATED) !== 0;
  var length = array.length;
  var items = state2.items;
  var current = skip_to_branch(state2.effect.first);
  var seen;
  var prev = null;
  var to_animate;
  var matched = [];
  var stashed = [];
  var value;
  var key;
  var effect2;
  var i;
  if (is_animated) {
    for (i = 0; i < length; i += 1) {
      value = array[i];
      key = get_key(value, i);
      effect2 = /** @type {EachItem} */
      items.get(key).e;
      if ((effect2.f & EFFECT_OFFSCREEN) === 0) {
        effect2.nodes?.a?.measure();
        (to_animate ?? (to_animate = /* @__PURE__ */ new Set())).add(effect2);
      }
    }
  }
  for (i = 0; i < length; i += 1) {
    value = array[i];
    key = get_key(value, i);
    effect2 = /** @type {EachItem} */
    items.get(key).e;
    if (state2.outrogroups !== null) {
      for (const group of state2.outrogroups) {
        group.pending.delete(effect2);
        group.done.delete(effect2);
      }
    }
    if ((effect2.f & EFFECT_OFFSCREEN) !== 0) {
      effect2.f ^= EFFECT_OFFSCREEN;
      if (effect2 === current) {
        move(effect2, null, anchor);
      } else {
        var next = prev ? prev.next : current;
        if (effect2 === state2.effect.last) {
          state2.effect.last = effect2.prev;
        }
        if (effect2.prev) effect2.prev.next = effect2.next;
        if (effect2.next) effect2.next.prev = effect2.prev;
        link(state2, prev, effect2);
        link(state2, effect2, next);
        move(effect2, next, anchor);
        prev = effect2;
        matched = [];
        stashed = [];
        current = skip_to_branch(prev.next);
        continue;
      }
    }
    if ((effect2.f & INERT) !== 0) {
      resume_effect(effect2);
      if (is_animated) {
        effect2.nodes?.a?.unfix();
        (to_animate ?? (to_animate = /* @__PURE__ */ new Set())).delete(effect2);
      }
    }
    if (effect2 !== current) {
      if (seen !== void 0 && seen.has(effect2)) {
        if (matched.length < stashed.length) {
          var start = stashed[0];
          var j;
          prev = start.prev;
          var a = matched[0];
          var b = matched[matched.length - 1];
          for (j = 0; j < matched.length; j += 1) {
            move(matched[j], start, anchor);
          }
          for (j = 0; j < stashed.length; j += 1) {
            seen.delete(stashed[j]);
          }
          link(state2, a.prev, b.next);
          link(state2, prev, a);
          link(state2, b, start);
          current = start;
          prev = b;
          i -= 1;
          matched = [];
          stashed = [];
        } else {
          seen.delete(effect2);
          move(effect2, current, anchor);
          link(state2, effect2.prev, effect2.next);
          link(state2, effect2, prev === null ? state2.effect.first : prev.next);
          link(state2, prev, effect2);
          prev = effect2;
        }
        continue;
      }
      matched = [];
      stashed = [];
      while (current !== null && current !== effect2) {
        (seen ?? (seen = /* @__PURE__ */ new Set())).add(current);
        stashed.push(current);
        current = skip_to_branch(current.next);
      }
      if (current === null) {
        continue;
      }
    }
    if ((effect2.f & EFFECT_OFFSCREEN) === 0) {
      matched.push(effect2);
    }
    prev = effect2;
    current = skip_to_branch(effect2.next);
  }
  if (state2.outrogroups !== null) {
    for (const group of state2.outrogroups) {
      if (group.pending.size === 0) {
        destroy_effects(array_from(group.done));
        state2.outrogroups?.delete(group);
      }
    }
    if (state2.outrogroups.size === 0) {
      state2.outrogroups = null;
    }
  }
  if (current !== null || seen !== void 0) {
    var to_destroy = [];
    if (seen !== void 0) {
      for (effect2 of seen) {
        if ((effect2.f & INERT) === 0) {
          to_destroy.push(effect2);
        }
      }
    }
    while (current !== null) {
      if ((current.f & INERT) === 0 && current !== state2.fallback) {
        to_destroy.push(current);
      }
      current = skip_to_branch(current.next);
    }
    var destroy_length = to_destroy.length;
    if (destroy_length > 0) {
      var controlled_anchor = (flags & EACH_IS_CONTROLLED) !== 0 && length === 0 ? anchor : null;
      if (is_animated) {
        for (i = 0; i < destroy_length; i += 1) {
          to_destroy[i].nodes?.a?.measure();
        }
        for (i = 0; i < destroy_length; i += 1) {
          to_destroy[i].nodes?.a?.fix();
        }
      }
      pause_effects(state2, to_destroy, controlled_anchor);
    }
  }
  if (is_animated) {
    queue_micro_task(() => {
      if (to_animate === void 0) return;
      for (effect2 of to_animate) {
        effect2.nodes?.a?.apply();
      }
    });
  }
}
function create_item(items, anchor, value, key, index2, render_fn, flags, get_collection) {
  var v = (flags & EACH_ITEM_REACTIVE) !== 0 ? (flags & EACH_ITEM_IMMUTABLE) === 0 ? mutable_source(value, false, false) : source(value) : null;
  var i = (flags & EACH_INDEX_REACTIVE) !== 0 ? source(index2) : null;
  if (v) {
    v.trace = () => {
      get_collection()[i?.v ?? index2];
    };
  }
  return {
    v,
    i,
    e: branch(() => {
      render_fn(anchor, v ?? value, i ?? index2, get_collection);
      return () => {
        items.delete(key);
      };
    })
  };
}
function move(effect2, next, anchor) {
  if (!effect2.nodes) return;
  var node = effect2.nodes.start;
  var end = effect2.nodes.end;
  var dest = next && (next.f & EFFECT_OFFSCREEN) === 0 ? (
    /** @type {EffectNodes} */
    next.nodes.start
  ) : anchor;
  while (node !== null) {
    var next_node = (
      /** @type {TemplateNode} */
      get_next_sibling(node)
    );
    dest.before(node);
    if (node === end) {
      return;
    }
    node = next_node;
  }
}
function link(state2, prev, next) {
  if (prev === null) {
    state2.effect.first = next;
  } else {
    prev.next = next;
  }
  if (next === null) {
    state2.effect.last = prev;
  } else {
    next.prev = prev;
  }
}
function set_style(dom, value, prev_styles, next_styles) {
  var prev = dom.__style;
  if (prev !== value) {
    var next_style_attr = to_style(value);
    {
      if (next_style_attr == null) {
        dom.removeAttribute("style");
      } else {
        dom.style.cssText = next_style_attr;
      }
    }
    dom.__style = value;
  }
  return next_styles;
}
function select_option(select, value, mounting = false) {
  if (select.multiple) {
    if (value == void 0) {
      return;
    }
    if (!is_array(value)) {
      return select_multiple_invalid_value();
    }
    for (var option of select.options) {
      option.selected = value.includes(get_option_value(option));
    }
    return;
  }
  for (option of select.options) {
    var option_value = get_option_value(option);
    if (is(option_value, value)) {
      option.selected = true;
      return;
    }
  }
  if (!mounting || value !== void 0) {
    select.selectedIndex = -1;
  }
}
function init_select(select) {
  var observer = new MutationObserver(() => {
    select_option(select, select.__value);
  });
  observer.observe(select, {
    // Listen to option element changes
    childList: true,
    subtree: true,
    // because of <optgroup>
    // Listen to option element value attribute changes
    // (doesn't get notified of select value changes,
    // because that property is not reflected as an attribute)
    attributes: true,
    attributeFilter: ["value"]
  });
  teardown(() => {
    observer.disconnect();
  });
}
function bind_select_value(select, get2, set2 = get2) {
  var batches = /* @__PURE__ */ new WeakSet();
  var mounting = true;
  listen_to_event_and_reset_event(select, "change", (is_reset) => {
    var query = is_reset ? "[selected]" : ":checked";
    var value;
    if (select.multiple) {
      value = [].map.call(select.querySelectorAll(query), get_option_value);
    } else {
      var selected_option = select.querySelector(query) ?? // will fall back to first non-disabled option if no option is selected
      select.querySelector("option:not([disabled])");
      value = selected_option && get_option_value(selected_option);
    }
    set2(value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
  });
  effect(() => {
    var value = get2();
    if (select === document.activeElement) {
      var batch = (
        /** @type {Batch} */
        previous_batch ?? current_batch
      );
      if (batches.has(batch)) {
        return;
      }
    }
    select_option(select, value, mounting);
    if (mounting && value === void 0) {
      var selected_option = select.querySelector(":checked");
      if (selected_option !== null) {
        value = get_option_value(selected_option);
        set2(value);
      }
    }
    select.__value = value;
    mounting = false;
  });
  init_select(select);
}
function get_option_value(option) {
  if ("__value" in option) {
    return option.__value;
  } else {
    return option.value;
  }
}
const IS_CUSTOM_ELEMENT = Symbol("is custom element");
const IS_HTML = Symbol("is html");
function set_attribute(element, attribute, value, skip_warning) {
  var attributes = get_attributes(element);
  if (attributes[attribute] === (attributes[attribute] = value)) return;
  if (attribute === "loading") {
    element[LOADING_ATTR_SYMBOL] = value;
  }
  if (value == null) {
    element.removeAttribute(attribute);
  } else if (typeof value !== "string" && get_setters(element).includes(attribute)) {
    element[attribute] = value;
  } else {
    element.setAttribute(attribute, value);
  }
}
function get_attributes(element) {
  return (
    /** @type {Record<string | symbol, unknown>} **/
    // @ts-expect-error
    element.__attributes ?? (element.__attributes = {
      [IS_CUSTOM_ELEMENT]: element.nodeName.includes("-"),
      [IS_HTML]: element.namespaceURI === NAMESPACE_HTML
    })
  );
}
var setters_cache = /* @__PURE__ */ new Map();
function get_setters(element) {
  var cache_key = element.getAttribute("is") || element.nodeName;
  var setters = setters_cache.get(cache_key);
  if (setters) return setters;
  setters_cache.set(cache_key, setters = []);
  var descriptors;
  var proto = element;
  var element_proto = Element.prototype;
  while (element_proto !== proto) {
    descriptors = get_descriptors(proto);
    for (var key in descriptors) {
      if (descriptors[key].set) {
        setters.push(key);
      }
    }
    proto = get_prototype_of(proto);
  }
  return setters;
}
function log_if_contains_state(method, ...objects) {
  untrack(() => {
    try {
      let has_state = false;
      const transformed = [];
      for (const obj of objects) {
        if (obj && typeof obj === "object" && STATE_SYMBOL in obj) {
          transformed.push(snapshot(obj, true));
          has_state = true;
        } else {
          transformed.push(obj);
        }
      }
      if (has_state) {
        console_log_state(method);
        console.log("%c[snapshot]", "color: grey", ...transformed);
      }
    } catch {
    }
  });
  return objects;
}
FeedbackForm[FILENAME] = "src/popup/components/FeedbackForm.svelte";
var root_1$5 = add_locations(from_html(`<div class="success-banner svelte-19knzis"><span class="success-icon svelte-19knzis">&#x2713;</span> <span> </span></div>`), FeedbackForm[FILENAME], [[118, 2, [[119, 4], [120, 4]]]]);
var root_3$3 = add_locations(from_html(`<div class="config-notice svelte-19knzis"><span>JAT IDE not configured. Reports will be saved locally.</span> <button type="button" class="config-link svelte-19knzis">Set up connection</button></div>`), FeedbackForm[FILENAME], [[125, 4, [[126, 6], [127, 6]]]]);
var root_4$3 = add_locations(from_html(`<option> </option>`), FeedbackForm[FILENAME], [[159, 10]]);
var root_5$1 = add_locations(from_html(`<option> </option>`), FeedbackForm[FILENAME], [[168, 10]]);
var root_6 = add_locations(from_html(`<div class="attachments svelte-19knzis"><span class="attach-icon svelte-19knzis">&#x1f4ce;</span> <span class="attach-text svelte-19knzis"> </span></div>`), FeedbackForm[FILENAME], [[175, 4, [[176, 6], [177, 6]]]]);
var root_8$1 = add_locations(from_html(`<img class="form-thumb svelte-19knzis"/>`), FeedbackForm[FILENAME], [[184, 8]]);
var root_9 = add_locations(from_html(`<span class="more-count svelte-19knzis"> </span>`), FeedbackForm[FILENAME], [[187, 8]]);
var root_7$1 = add_locations(from_html(`<div class="screenshot-strip svelte-19knzis"><!> <!></div>`), FeedbackForm[FILENAME], [[182, 4]]);
var root_10 = add_locations(from_html(`<div class="error svelte-19knzis"> </div>`), FeedbackForm[FILENAME], [[193, 4]]);
var root_11 = add_locations(from_html(`<span class="spinner svelte-19knzis"></span> Submitting...`, 1), FeedbackForm[FILENAME], [[202, 8]]);
var root_2$4 = add_locations(from_html(`<form class="form svelte-19knzis"><!> <div class="field svelte-19knzis"><label for="title" class="svelte-19knzis">Title <span class="required svelte-19knzis">*</span></label> <input id="title" type="text" placeholder="Brief description of the issue" required class="svelte-19knzis"/></div> <div class="field svelte-19knzis"><label for="description" class="svelte-19knzis">Description</label> <textarea id="description" placeholder="Steps to reproduce, expected vs actual behavior..." rows="4" class="svelte-19knzis"></textarea></div> <div class="field-row svelte-19knzis"><div class="field half svelte-19knzis"><label for="type" class="svelte-19knzis">Type</label> <select id="type" class="svelte-19knzis"></select></div> <div class="field half svelte-19knzis"><label for="priority" class="svelte-19knzis">Priority</label> <select id="priority" class="svelte-19knzis"></select></div></div> <!> <!> <!> <div class="actions svelte-19knzis"><button type="button" class="cancel-btn svelte-19knzis">Cancel</button> <button type="submit" class="submit-btn svelte-19knzis"><!></button></div></form>`), FeedbackForm[FILENAME], [
  [
    123,
    0,
    [
      [131, 2, [[132, 4, [[132, 29]]], [133, 4]]],
      [143, 2, [[144, 4], [145, 4]]],
      [
        154,
        2,
        [
          [155, 4, [[156, 6], [157, 6]]],
          [164, 4, [[165, 6], [166, 6]]]
        ]
      ],
      [196, 2, [[197, 4], [200, 4]]]
    ]
  ]
]);
const $$css$5 = {
  hash: "svelte-19knzis",
  code: "\n  .form.svelte-19knzis {\n    display: flex;\n    flex-direction: column;\n    gap: 12px;\n  }\n\n  .field.svelte-19knzis {\n    display: flex;\n    flex-direction: column;\n    gap: 4px;\n  }\n\n  .field-row.svelte-19knzis {\n    display: flex;\n    gap: 10px;\n  }\n\n  .half.svelte-19knzis {\n    flex: 1;\n  }\n\n  label.svelte-19knzis {\n    font-weight: 600;\n    font-size: 12px;\n    color: #374151;\n  }\n\n  .required.svelte-19knzis {\n    color: #dc2626;\n  }\n\n  input.svelte-19knzis, textarea.svelte-19knzis, select.svelte-19knzis {\n    padding: 7px 10px;\n    border: 1px solid #d1d5db;\n    border-radius: 5px;\n    font-size: 13px;\n    font-family: inherit;\n    color: #1f2937;\n    background: #fff;\n    transition: border-color 0.15s;\n  }\n  input.svelte-19knzis:focus, textarea.svelte-19knzis:focus, select.svelte-19knzis:focus {\n    outline: none;\n    border-color: #3b82f6;\n    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);\n  }\n  input.svelte-19knzis:disabled, textarea.svelte-19knzis:disabled, select.svelte-19knzis:disabled {\n    opacity: 0.6;\n    cursor: not-allowed;\n  }\n\n  textarea.svelte-19knzis {\n    resize: vertical;\n    min-height: 60px;\n  }\n\n  .attachments.svelte-19knzis {\n    display: flex;\n    align-items: center;\n    gap: 6px;\n    padding: 6px 10px;\n    background: #f0f9ff;\n    border: 1px solid #bae6fd;\n    border-radius: 5px;\n    font-size: 12px;\n    color: #0369a1;\n  }\n\n  .attach-icon.svelte-19knzis {\n    font-size: 13px;\n  }\n\n  .attach-text.svelte-19knzis {\n    flex: 1;\n  }\n\n  .screenshot-strip.svelte-19knzis {\n    display: flex;\n    gap: 4px;\n    align-items: center;\n  }\n\n  .form-thumb.svelte-19knzis {\n    width: 56px;\n    height: 38px;\n    object-fit: cover;\n    border-radius: 4px;\n    border: 1px solid #e5e7eb;\n  }\n\n  .more-count.svelte-19knzis {\n    font-size: 11px;\n    color: #9ca3af;\n    padding: 0 4px;\n  }\n\n  .success-banner.svelte-19knzis {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 8px;\n    padding: 20px;\n    background: #f0fdf4;\n    border: 1px solid #bbf7d0;\n    border-radius: 8px;\n    color: #166534;\n    font-size: 15px;\n    font-weight: 600;\n  }\n\n  .success-icon.svelte-19knzis {\n    font-size: 20px;\n    color: #16a34a;\n  }\n\n  .config-notice.svelte-19knzis {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;\n    gap: 8px;\n    padding: 8px 10px;\n    background: #fffbeb;\n    border: 1px solid #fde68a;\n    border-radius: 5px;\n    font-size: 12px;\n    color: #92400e;\n  }\n\n  .config-link.svelte-19knzis {\n    background: none;\n    border: none;\n    color: #2563eb;\n    font-size: 12px;\n    cursor: pointer;\n    padding: 0;\n    font-family: inherit;\n    text-decoration: underline;\n    white-space: nowrap;\n  }\n\n  .config-link.svelte-19knzis:hover {\n    color: #1d4ed8;\n  }\n\n  .error.svelte-19knzis {\n    padding: 6px 10px;\n    background: #fef2f2;\n    border: 1px solid #fecaca;\n    border-radius: 5px;\n    color: #dc2626;\n    font-size: 12px;\n  }\n\n  .actions.svelte-19knzis {\n    display: flex;\n    gap: 8px;\n    justify-content: flex-end;\n    padding-top: 4px;\n  }\n\n  .cancel-btn.svelte-19knzis {\n    padding: 7px 14px;\n    background: #f9fafb;\n    border: 1px solid #d1d5db;\n    border-radius: 5px;\n    color: #374151;\n    font-size: 13px;\n    cursor: pointer;\n  }\n  .cancel-btn.svelte-19knzis:hover:not(:disabled) {\n    background: #f3f4f6;\n  }\n  .cancel-btn.svelte-19knzis:disabled {\n    opacity: 0.5;\n    cursor: not-allowed;\n  }\n\n  .submit-btn.svelte-19knzis {\n    padding: 7px 16px;\n    background: #3b82f6;\n    border: none;\n    border-radius: 5px;\n    color: white;\n    font-size: 13px;\n    font-weight: 600;\n    cursor: pointer;\n    display: flex;\n    align-items: center;\n    gap: 6px;\n    transition: background 0.15s;\n  }\n  .submit-btn.svelte-19knzis:hover:not(:disabled) {\n    background: #2563eb;\n  }\n  .submit-btn.svelte-19knzis:disabled {\n    opacity: 0.6;\n    cursor: not-allowed;\n  }\n\n  .spinner.svelte-19knzis {\n    display: inline-block;\n    width: 14px;\n    height: 14px;\n    border: 2px solid rgba(255,255,255,0.3);\n    border-top-color: white;\n    border-radius: 50%;\n    animation: svelte-19knzis-spin 0.6s linear infinite;\n  }\n\n  @keyframes svelte-19knzis-spin {\n    to { transform: rotate(360deg); }\n  }\n\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRmVlZGJhY2tGb3JtLnN2ZWx0ZSIsInNvdXJjZXMiOlsiRmVlZGJhY2tGb3JtLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0IGxhbmc9XCJ0c1wiPlxuICBpbXBvcnQgdHlwZSB7IENvbnNvbGVMb2dFbnRyeSwgRWxlbWVudERhdGEgfSBmcm9tICcuLi9zdG9yZXMvY2FwdHVyZWREYXRhLnN2ZWx0ZSdcbiAgaW1wb3J0IHsgaXNDb25maWd1cmVkLCBzdWJtaXRGZWVkYmFjayB9IGZyb20gJy4uLy4uL2xpYi9zdXBhYmFzZSdcblxuICBpbnRlcmZhY2UgUHJvcHMge1xuICAgIHNjcmVlbnNob3RzOiBzdHJpbmdbXVxuICAgIGNvbnNvbGVMb2dzOiBDb25zb2xlTG9nRW50cnlbXVxuICAgIHNlbGVjdGVkRWxlbWVudHM6IEVsZW1lbnREYXRhW11cbiAgICBvbmNsb3NlOiAoKSA9PiB2b2lkXG4gIH1cblxuICBsZXQgeyBzY3JlZW5zaG90cywgY29uc29sZUxvZ3MsIHNlbGVjdGVkRWxlbWVudHMsIG9uY2xvc2UgfTogUHJvcHMgPSAkcHJvcHMoKVxuXG4gIGxldCB0aXRsZSA9ICRzdGF0ZSgnJylcbiAgbGV0IGRlc2NyaXB0aW9uID0gJHN0YXRlKCcnKVxuICBsZXQgdHlwZTogJ2J1ZycgfCAnZW5oYW5jZW1lbnQnIHwgJ290aGVyJyA9ICRzdGF0ZSgnYnVnJylcbiAgbGV0IHByaW9yaXR5OiAnbG93JyB8ICdtZWRpdW0nIHwgJ2hpZ2gnIHwgJ2NyaXRpY2FsJyA9ICRzdGF0ZSgnbWVkaXVtJylcbiAgbGV0IHN1Ym1pdHRpbmcgPSAkc3RhdGUoZmFsc2UpXG4gIGxldCBzdWJtaXRFcnJvciA9ICRzdGF0ZSgnJylcbiAgbGV0IHN1Ym1pdFN1Y2Nlc3MgPSAkc3RhdGUoZmFsc2UpXG4gIGxldCBjb25maWd1cmVkID0gJHN0YXRlPGJvb2xlYW4gfCBudWxsPihudWxsKVxuXG4gIGNvbnN0IHR5cGVPcHRpb25zID0gW1xuICAgIHsgdmFsdWU6ICdidWcnLCBsYWJlbDogJ0J1ZycgfSxcbiAgICB7IHZhbHVlOiAnZW5oYW5jZW1lbnQnLCBsYWJlbDogJ0VuaGFuY2VtZW50JyB9LFxuICAgIHsgdmFsdWU6ICdvdGhlcicsIGxhYmVsOiAnT3RoZXInIH0sXG4gIF0gYXMgY29uc3RcblxuICBjb25zdCBwcmlvcml0eU9wdGlvbnMgPSBbXG4gICAgeyB2YWx1ZTogJ2xvdycsIGxhYmVsOiAnTG93JywgZGVzYzogJ01pbm9yIGlzc3VlJyB9LFxuICAgIHsgdmFsdWU6ICdtZWRpdW0nLCBsYWJlbDogJ01lZGl1bScsIGRlc2M6ICdOb3RhYmxlIGlzc3VlJyB9LFxuICAgIHsgdmFsdWU6ICdoaWdoJywgbGFiZWw6ICdIaWdoJywgZGVzYzogJ01ham9yIGlzc3VlJyB9LFxuICAgIHsgdmFsdWU6ICdjcml0aWNhbCcsIGxhYmVsOiAnQ3JpdGljYWwnLCBkZXNjOiAnQmxvY2tpbmcnIH0sXG4gIF0gYXMgY29uc3RcblxuICAvLyBDaGVjayBpZiBKQVQgSURFIGlzIGNvbmZpZ3VyZWQgb24gbW91bnRcbiAgJGVmZmVjdCgoKSA9PiB7XG4gICAgaXNDb25maWd1cmVkKCkudGhlbih2ID0+IHsgY29uZmlndXJlZCA9IHYgfSlcbiAgfSlcblxuICBhc3luYyBmdW5jdGlvbiBoYW5kbGVTdWJtaXQoZTogU3VibWl0RXZlbnQpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KClcbiAgICBpZiAoIXRpdGxlLnRyaW0oKSkgcmV0dXJuXG5cbiAgICBzdWJtaXR0aW5nID0gdHJ1ZVxuICAgIHN1Ym1pdEVycm9yID0gJydcbiAgICBzdWJtaXRTdWNjZXNzID0gZmFsc2VcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYWdlVXJsID0gKGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pKVswXT8udXJsIHx8ICcnXG5cbiAgICAgIGlmIChjb25maWd1cmVkKSB7XG4gICAgICAgIC8vIFN1Ym1pdCB0byBKQVQgSURFXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN1Ym1pdEZlZWRiYWNrKFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHRpdGxlOiB0aXRsZS50cmltKCksXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb24udHJpbSgpLFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIHByaW9yaXR5LFxuICAgICAgICAgICAgcGFnZV91cmw6IHBhZ2VVcmwsXG4gICAgICAgICAgICB1c2VyX2FnZW50OiBuYXZpZ2F0b3IudXNlckFnZW50LFxuICAgICAgICAgICAgY29uc29sZV9sb2dzOiBjb25zb2xlTG9ncy5sZW5ndGggPiAwID8gY29uc29sZUxvZ3MgOiBudWxsLFxuICAgICAgICAgICAgc2VsZWN0ZWRfZWxlbWVudHM6IHNlbGVjdGVkRWxlbWVudHMubGVuZ3RoID4gMCA/IHNlbGVjdGVkRWxlbWVudHMgOiBudWxsLFxuICAgICAgICAgICAgc2NyZWVuc2hvdF91cmxzOiBudWxsLFxuICAgICAgICAgICAgbWV0YWRhdGE6IG51bGwsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzY3JlZW5zaG90cyxcbiAgICAgICAgKVxuXG4gICAgICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICAgICAgc3VibWl0RXJyb3IgPSByZXN1bHQuZXJyb3IgfHwgJ1N1Ym1pc3Npb24gZmFpbGVkJ1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBGYWxsYmFjazogc3RvcmUgbG9jYWxseSB3aGVuIEpBVCBJREUgaXMgbm90IGNvbmZpZ3VyZWRcbiAgICAgICAgY29uc3QgcmVwb3J0ID0ge1xuICAgICAgICAgIHRpdGxlOiB0aXRsZS50cmltKCksXG4gICAgICAgICAgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uLnRyaW0oKSxcbiAgICAgICAgICB0eXBlLFxuICAgICAgICAgIHByaW9yaXR5LFxuICAgICAgICAgIHVybDogcGFnZVVybCxcbiAgICAgICAgICB1c2VyQWdlbnQ6IG5hdmlnYXRvci51c2VyQWdlbnQsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgY2FwdHVyZWREYXRhOiB7IHNjcmVlbnNob3RzLCBjb25zb2xlTG9ncywgc2VsZWN0ZWRFbGVtZW50cyB9LFxuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7XG4gICAgICAgICAgW2BidWdSZXBvcnRfJHtEYXRlLm5vdygpfWBdOiByZXBvcnQsXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIC8vIENsZWFyIGNhcHR1cmVkIGRhdGEgYWZ0ZXIgc3VjY2Vzc2Z1bCBzdWJtaXNzaW9uXG4gICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdDTEVBUl9DQVBUVVJFRF9EQVRBJyB9KVxuXG4gICAgICBzdWJtaXRTdWNjZXNzID0gdHJ1ZVxuICAgICAgc2V0VGltZW91dCgoKSA9PiBvbmNsb3NlKCksIDEyMDApXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBzdWJtaXRFcnJvciA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnU3VibWlzc2lvbiBmYWlsZWQnXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHN1Ym1pdHRpbmcgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9wZW5TZXR0aW5ncygpIHtcbiAgICBjaHJvbWUucnVudGltZS5vcGVuT3B0aW9uc1BhZ2U/LigpXG4gIH1cblxuICAvLyBTdW1tYXJ5IG9mIGF0dGFjaGVkIGRhdGFcbiAgZnVuY3Rpb24gYXR0YWNobWVudFN1bW1hcnkoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdXG4gICAgaWYgKHNjcmVlbnNob3RzLmxlbmd0aCA+IDApIHBhcnRzLnB1c2goYCR7c2NyZWVuc2hvdHMubGVuZ3RofSBzY3JlZW5zaG90JHtzY3JlZW5zaG90cy5sZW5ndGggPiAxID8gJ3MnIDogJyd9YClcbiAgICBpZiAoY29uc29sZUxvZ3MubGVuZ3RoID4gMCkgcGFydHMucHVzaChgJHtjb25zb2xlTG9ncy5sZW5ndGh9IGNvbnNvbGUgbG9nJHtjb25zb2xlTG9ncy5sZW5ndGggPiAxID8gJ3MnIDogJyd9YClcbiAgICBpZiAoc2VsZWN0ZWRFbGVtZW50cy5sZW5ndGggPiAwKSBwYXJ0cy5wdXNoKGAke3NlbGVjdGVkRWxlbWVudHMubGVuZ3RofSBlbGVtZW50JHtzZWxlY3RlZEVsZW1lbnRzLmxlbmd0aCA+IDEgPyAncycgOiAnJ31gKVxuICAgIHJldHVybiBwYXJ0c1xuICB9XG48L3NjcmlwdD5cblxueyNpZiBzdWJtaXRTdWNjZXNzfVxuICA8ZGl2IGNsYXNzPVwic3VjY2Vzcy1iYW5uZXJcIj5cbiAgICA8c3BhbiBjbGFzcz1cInN1Y2Nlc3MtaWNvblwiPiYjeDI3MTM7PC9zcGFuPlxuICAgIDxzcGFuPlJlcG9ydCBzdWJtaXR0ZWR7Y29uZmlndXJlZCA/ICcnIDogJyAoc2F2ZWQgbG9jYWxseSknfSE8L3NwYW4+XG4gIDwvZGl2PlxuezplbHNlfVxuPGZvcm0gY2xhc3M9XCJmb3JtXCIgb25zdWJtaXQ9e2hhbmRsZVN1Ym1pdH0+XG4gIHsjaWYgY29uZmlndXJlZCA9PT0gZmFsc2V9XG4gICAgPGRpdiBjbGFzcz1cImNvbmZpZy1ub3RpY2VcIj5cbiAgICAgIDxzcGFuPkpBVCBJREUgbm90IGNvbmZpZ3VyZWQuIFJlcG9ydHMgd2lsbCBiZSBzYXZlZCBsb2NhbGx5Ljwvc3Bhbj5cbiAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiY29uZmlnLWxpbmtcIiBvbmNsaWNrPXtvcGVuU2V0dGluZ3N9PlNldCB1cCBjb25uZWN0aW9uPC9idXR0b24+XG4gICAgPC9kaXY+XG4gIHsvaWZ9XG5cbiAgPGRpdiBjbGFzcz1cImZpZWxkXCI+XG4gICAgPGxhYmVsIGZvcj1cInRpdGxlXCI+VGl0bGUgPHNwYW4gY2xhc3M9XCJyZXF1aXJlZFwiPio8L3NwYW4+PC9sYWJlbD5cbiAgICA8aW5wdXRcbiAgICAgIGlkPVwidGl0bGVcIlxuICAgICAgdHlwZT1cInRleHRcIlxuICAgICAgYmluZDp2YWx1ZT17dGl0bGV9XG4gICAgICBwbGFjZWhvbGRlcj1cIkJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBpc3N1ZVwiXG4gICAgICByZXF1aXJlZFxuICAgICAgZGlzYWJsZWQ9e3N1Ym1pdHRpbmd9XG4gICAgLz5cbiAgPC9kaXY+XG5cbiAgPGRpdiBjbGFzcz1cImZpZWxkXCI+XG4gICAgPGxhYmVsIGZvcj1cImRlc2NyaXB0aW9uXCI+RGVzY3JpcHRpb248L2xhYmVsPlxuICAgIDx0ZXh0YXJlYVxuICAgICAgaWQ9XCJkZXNjcmlwdGlvblwiXG4gICAgICBiaW5kOnZhbHVlPXtkZXNjcmlwdGlvbn1cbiAgICAgIHBsYWNlaG9sZGVyPVwiU3RlcHMgdG8gcmVwcm9kdWNlLCBleHBlY3RlZCB2cyBhY3R1YWwgYmVoYXZpb3IuLi5cIlxuICAgICAgcm93cz1cIjRcIlxuICAgICAgZGlzYWJsZWQ9e3N1Ym1pdHRpbmd9XG4gICAgPjwvdGV4dGFyZWE+XG4gIDwvZGl2PlxuXG4gIDxkaXYgY2xhc3M9XCJmaWVsZC1yb3dcIj5cbiAgICA8ZGl2IGNsYXNzPVwiZmllbGQgaGFsZlwiPlxuICAgICAgPGxhYmVsIGZvcj1cInR5cGVcIj5UeXBlPC9sYWJlbD5cbiAgICAgIDxzZWxlY3QgaWQ9XCJ0eXBlXCIgYmluZDp2YWx1ZT17dHlwZX0gZGlzYWJsZWQ9e3N1Ym1pdHRpbmd9PlxuICAgICAgICB7I2VhY2ggdHlwZU9wdGlvbnMgYXMgb3B0fVxuICAgICAgICAgIDxvcHRpb24gdmFsdWU9e29wdC52YWx1ZX0+e29wdC5sYWJlbH08L29wdGlvbj5cbiAgICAgICAgey9lYWNofVxuICAgICAgPC9zZWxlY3Q+XG4gICAgPC9kaXY+XG5cbiAgICA8ZGl2IGNsYXNzPVwiZmllbGQgaGFsZlwiPlxuICAgICAgPGxhYmVsIGZvcj1cInByaW9yaXR5XCI+UHJpb3JpdHk8L2xhYmVsPlxuICAgICAgPHNlbGVjdCBpZD1cInByaW9yaXR5XCIgYmluZDp2YWx1ZT17cHJpb3JpdHl9IGRpc2FibGVkPXtzdWJtaXR0aW5nfT5cbiAgICAgICAgeyNlYWNoIHByaW9yaXR5T3B0aW9ucyBhcyBvcHR9XG4gICAgICAgICAgPG9wdGlvbiB2YWx1ZT17b3B0LnZhbHVlfT57b3B0LmxhYmVsfSAtIHtvcHQuZGVzY308L29wdGlvbj5cbiAgICAgICAgey9lYWNofVxuICAgICAgPC9zZWxlY3Q+XG4gICAgPC9kaXY+XG4gIDwvZGl2PlxuXG4gIHsjaWYgYXR0YWNobWVudFN1bW1hcnkoKS5sZW5ndGggPiAwfVxuICAgIDxkaXYgY2xhc3M9XCJhdHRhY2htZW50c1wiPlxuICAgICAgPHNwYW4gY2xhc3M9XCJhdHRhY2gtaWNvblwiPiYjeDFmNGNlOzwvc3Bhbj5cbiAgICAgIDxzcGFuIGNsYXNzPVwiYXR0YWNoLXRleHRcIj57YXR0YWNobWVudFN1bW1hcnkoKS5qb2luKCcsICcpfSBhdHRhY2hlZDwvc3Bhbj5cbiAgICA8L2Rpdj5cbiAgey9pZn1cblxuICB7I2lmIHNjcmVlbnNob3RzLmxlbmd0aCA+IDB9XG4gICAgPGRpdiBjbGFzcz1cInNjcmVlbnNob3Qtc3RyaXBcIj5cbiAgICAgIHsjZWFjaCBzY3JlZW5zaG90cy5zbGljZSgtMykgYXMgc3JjLCBpfVxuICAgICAgICA8aW1nIGNsYXNzPVwiZm9ybS10aHVtYlwiIHNyYz17c3JjfSBhbHQ9XCJBdHRhY2htZW50IHtpICsgMX1cIiAvPlxuICAgICAgey9lYWNofVxuICAgICAgeyNpZiBzY3JlZW5zaG90cy5sZW5ndGggPiAzfVxuICAgICAgICA8c3BhbiBjbGFzcz1cIm1vcmUtY291bnRcIj4re3NjcmVlbnNob3RzLmxlbmd0aCAtIDN9PC9zcGFuPlxuICAgICAgey9pZn1cbiAgICA8L2Rpdj5cbiAgey9pZn1cblxuICB7I2lmIHN1Ym1pdEVycm9yfVxuICAgIDxkaXYgY2xhc3M9XCJlcnJvclwiPntzdWJtaXRFcnJvcn08L2Rpdj5cbiAgey9pZn1cblxuICA8ZGl2IGNsYXNzPVwiYWN0aW9uc1wiPlxuICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiY2FuY2VsLWJ0blwiIG9uY2xpY2s9e29uY2xvc2V9IGRpc2FibGVkPXtzdWJtaXR0aW5nfT5cbiAgICAgIENhbmNlbFxuICAgIDwvYnV0dG9uPlxuICAgIDxidXR0b24gdHlwZT1cInN1Ym1pdFwiIGNsYXNzPVwic3VibWl0LWJ0blwiIGRpc2FibGVkPXtzdWJtaXR0aW5nIHx8ICF0aXRsZS50cmltKCl9PlxuICAgICAgeyNpZiBzdWJtaXR0aW5nfVxuICAgICAgICA8c3BhbiBjbGFzcz1cInNwaW5uZXJcIj48L3NwYW4+XG4gICAgICAgIFN1Ym1pdHRpbmcuLi5cbiAgICAgIHs6ZWxzZX1cbiAgICAgICAgU3VibWl0IFJlcG9ydFxuICAgICAgey9pZn1cbiAgICA8L2J1dHRvbj5cbiAgPC9kaXY+XG48L2Zvcm0+XG57L2lmfVxuXG48c3R5bGU+XG4gIC5mb3JtIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgZ2FwOiAxMnB4O1xuICB9XG5cbiAgLmZpZWxkIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgZ2FwOiA0cHg7XG4gIH1cblxuICAuZmllbGQtcm93IHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGdhcDogMTBweDtcbiAgfVxuXG4gIC5oYWxmIHtcbiAgICBmbGV4OiAxO1xuICB9XG5cbiAgbGFiZWwge1xuICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgZm9udC1zaXplOiAxMnB4O1xuICAgIGNvbG9yOiAjMzc0MTUxO1xuICB9XG5cbiAgLnJlcXVpcmVkIHtcbiAgICBjb2xvcjogI2RjMjYyNjtcbiAgfVxuXG4gIGlucHV0LCB0ZXh0YXJlYSwgc2VsZWN0IHtcbiAgICBwYWRkaW5nOiA3cHggMTBweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiO1xuICAgIGJvcmRlci1yYWRpdXM6IDVweDtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gICAgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG4gICAgY29sb3I6ICMxZjI5Mzc7XG4gICAgYmFja2dyb3VuZDogI2ZmZjtcbiAgICB0cmFuc2l0aW9uOiBib3JkZXItY29sb3IgMC4xNXM7XG4gIH1cbiAgaW5wdXQ6Zm9jdXMsIHRleHRhcmVhOmZvY3VzLCBzZWxlY3Q6Zm9jdXMge1xuICAgIG91dGxpbmU6IG5vbmU7XG4gICAgYm9yZGVyLWNvbG9yOiAjM2I4MmY2O1xuICAgIGJveC1zaGFkb3c6IDAgMCAwIDJweCByZ2JhKDU5LCAxMzAsIDI0NiwgMC4xNSk7XG4gIH1cbiAgaW5wdXQ6ZGlzYWJsZWQsIHRleHRhcmVhOmRpc2FibGVkLCBzZWxlY3Q6ZGlzYWJsZWQge1xuICAgIG9wYWNpdHk6IDAuNjtcbiAgICBjdXJzb3I6IG5vdC1hbGxvd2VkO1xuICB9XG5cbiAgdGV4dGFyZWEge1xuICAgIHJlc2l6ZTogdmVydGljYWw7XG4gICAgbWluLWhlaWdodDogNjBweDtcbiAgfVxuXG4gIC5hdHRhY2htZW50cyB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGdhcDogNnB4O1xuICAgIHBhZGRpbmc6IDZweCAxMHB4O1xuICAgIGJhY2tncm91bmQ6ICNmMGY5ZmY7XG4gICAgYm9yZGVyOiAxcHggc29saWQgI2JhZTZmZDtcbiAgICBib3JkZXItcmFkaXVzOiA1cHg7XG4gICAgZm9udC1zaXplOiAxMnB4O1xuICAgIGNvbG9yOiAjMDM2OWExO1xuICB9XG5cbiAgLmF0dGFjaC1pY29uIHtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gIH1cblxuICAuYXR0YWNoLXRleHQge1xuICAgIGZsZXg6IDE7XG4gIH1cblxuICAuc2NyZWVuc2hvdC1zdHJpcCB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBnYXA6IDRweDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICB9XG5cbiAgLmZvcm0tdGh1bWIge1xuICAgIHdpZHRoOiA1NnB4O1xuICAgIGhlaWdodDogMzhweDtcbiAgICBvYmplY3QtZml0OiBjb3ZlcjtcbiAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgYm9yZGVyOiAxcHggc29saWQgI2U1ZTdlYjtcbiAgfVxuXG4gIC5tb3JlLWNvdW50IHtcbiAgICBmb250LXNpemU6IDExcHg7XG4gICAgY29sb3I6ICM5Y2EzYWY7XG4gICAgcGFkZGluZzogMCA0cHg7XG4gIH1cblxuICAuc3VjY2Vzcy1iYW5uZXIge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICBnYXA6IDhweDtcbiAgICBwYWRkaW5nOiAyMHB4O1xuICAgIGJhY2tncm91bmQ6ICNmMGZkZjQ7XG4gICAgYm9yZGVyOiAxcHggc29saWQgI2JiZjdkMDtcbiAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgY29sb3I6ICMxNjY1MzQ7XG4gICAgZm9udC1zaXplOiAxNXB4O1xuICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gIH1cblxuICAuc3VjY2Vzcy1pY29uIHtcbiAgICBmb250LXNpemU6IDIwcHg7XG4gICAgY29sb3I6ICMxNmEzNGE7XG4gIH1cblxuICAuY29uZmlnLW5vdGljZSB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICBnYXA6IDhweDtcbiAgICBwYWRkaW5nOiA4cHggMTBweDtcbiAgICBiYWNrZ3JvdW5kOiAjZmZmYmViO1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNmZGU2OGE7XG4gICAgYm9yZGVyLXJhZGl1czogNXB4O1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICBjb2xvcjogIzkyNDAwZTtcbiAgfVxuXG4gIC5jb25maWctbGluayB7XG4gICAgYmFja2dyb3VuZDogbm9uZTtcbiAgICBib3JkZXI6IG5vbmU7XG4gICAgY29sb3I6ICMyNTYzZWI7XG4gICAgZm9udC1zaXplOiAxMnB4O1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICBwYWRkaW5nOiAwO1xuICAgIGZvbnQtZmFtaWx5OiBpbmhlcml0O1xuICAgIHRleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1xuICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gIH1cblxuICAuY29uZmlnLWxpbms6aG92ZXIge1xuICAgIGNvbG9yOiAjMWQ0ZWQ4O1xuICB9XG5cbiAgLmVycm9yIHtcbiAgICBwYWRkaW5nOiA2cHggMTBweDtcbiAgICBiYWNrZ3JvdW5kOiAjZmVmMmYyO1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNmZWNhY2E7XG4gICAgYm9yZGVyLXJhZGl1czogNXB4O1xuICAgIGNvbG9yOiAjZGMyNjI2O1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgfVxuXG4gIC5hY3Rpb25zIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGdhcDogOHB4O1xuICAgIGp1c3RpZnktY29udGVudDogZmxleC1lbmQ7XG4gICAgcGFkZGluZy10b3A6IDRweDtcbiAgfVxuXG4gIC5jYW5jZWwtYnRuIHtcbiAgICBwYWRkaW5nOiA3cHggMTRweDtcbiAgICBiYWNrZ3JvdW5kOiAjZjlmYWZiO1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNkMWQ1ZGI7XG4gICAgYm9yZGVyLXJhZGl1czogNXB4O1xuICAgIGNvbG9yOiAjMzc0MTUxO1xuICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gIH1cbiAgLmNhbmNlbC1idG46aG92ZXI6bm90KDpkaXNhYmxlZCkge1xuICAgIGJhY2tncm91bmQ6ICNmM2Y0ZjY7XG4gIH1cbiAgLmNhbmNlbC1idG46ZGlzYWJsZWQge1xuICAgIG9wYWNpdHk6IDAuNTtcbiAgICBjdXJzb3I6IG5vdC1hbGxvd2VkO1xuICB9XG5cbiAgLnN1Ym1pdC1idG4ge1xuICAgIHBhZGRpbmc6IDdweCAxNnB4O1xuICAgIGJhY2tncm91bmQ6ICMzYjgyZjY7XG4gICAgYm9yZGVyOiBub25lO1xuICAgIGJvcmRlci1yYWRpdXM6IDVweDtcbiAgICBjb2xvcjogd2hpdGU7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgY3Vyc29yOiBwb2ludGVyO1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBnYXA6IDZweDtcbiAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMTVzO1xuICB9XG4gIC5zdWJtaXQtYnRuOmhvdmVyOm5vdCg6ZGlzYWJsZWQpIHtcbiAgICBiYWNrZ3JvdW5kOiAjMjU2M2ViO1xuICB9XG4gIC5zdWJtaXQtYnRuOmRpc2FibGVkIHtcbiAgICBvcGFjaXR5OiAwLjY7XG4gICAgY3Vyc29yOiBub3QtYWxsb3dlZDtcbiAgfVxuXG4gIC5zcGlubmVyIHtcbiAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgd2lkdGg6IDE0cHg7XG4gICAgaGVpZ2h0OiAxNHB4O1xuICAgIGJvcmRlcjogMnB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4zKTtcbiAgICBib3JkZXItdG9wLWNvbG9yOiB3aGl0ZTtcbiAgICBib3JkZXItcmFkaXVzOiA1MCU7XG4gICAgYW5pbWF0aW9uOiBzcGluIDAuNnMgbGluZWFyIGluZmluaXRlO1xuICB9XG5cbiAgQGtleWZyYW1lcyBzcGluIHtcbiAgICB0byB7IHRyYW5zZm9ybTogcm90YXRlKDM2MGRlZyk7IH1cbiAgfVxuPC9zdHlsZT5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiIiwiaWdub3JlTGlzdCI6W119 */"
};
function FeedbackForm($$anchor, $$props) {
  check_target(new.target);
  push($$props, true, FeedbackForm);
  append_styles($$anchor, $$css$5);
  let title = tag(state(""), "title");
  let description = tag(state(""), "description");
  let type = tag(state("bug"), "type");
  let priority = tag(state("medium"), "priority");
  let submitting = tag(state(false), "submitting");
  let submitError = tag(state(""), "submitError");
  let submitSuccess = tag(state(false), "submitSuccess");
  let configured = tag(state(null), "configured");
  const typeOptions = [
    { value: "bug", label: "Bug" },
    { value: "enhancement", label: "Enhancement" },
    { value: "other", label: "Other" }
  ];
  const priorityOptions = [
    { value: "low", label: "Low", desc: "Minor issue" },
    { value: "medium", label: "Medium", desc: "Notable issue" },
    { value: "high", label: "High", desc: "Major issue" },
    { value: "critical", label: "Critical", desc: "Blocking" }
  ];
  user_effect(() => {
    isConfigured().then((v) => {
      set(configured, v, true);
    });
  });
  async function handleSubmit(e) {
    e.preventDefault();
    if (!get(title).trim()) return;
    set(submitting, true);
    set(submitError, "");
    set(submitSuccess, false);
    try {
      const pageUrl = (await track_reactivity_loss(chrome.tabs.query({ active: true, currentWindow: true })))()[0]?.url || "";
      if (get(configured)) {
        const result = (await track_reactivity_loss(submitFeedback(
          {
            title: get(title).trim(),
            description: get(description).trim(),
            type: get(type),
            priority: get(priority),
            page_url: pageUrl,
            user_agent: navigator.userAgent,
            console_logs: $$props.consoleLogs.length > 0 ? $$props.consoleLogs : null,
            selected_elements: $$props.selectedElements.length > 0 ? $$props.selectedElements : null,
            screenshot_urls: null,
            metadata: null
          },
          $$props.screenshots
        )))();
        if (!result.ok) {
          set(submitError, result.error || "Submission failed", true);
          return;
        }
      } else {
        const report = {
          title: get(title).trim(),
          description: get(description).trim(),
          type: get(type),
          priority: get(priority),
          url: pageUrl,
          userAgent: navigator.userAgent,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          capturedData: {
            screenshots: $$props.screenshots,
            consoleLogs: $$props.consoleLogs,
            selectedElements: $$props.selectedElements
          }
        };
        (await track_reactivity_loss(chrome.storage.local.set({ [`bugReport_${Date.now()}`]: report })))();
      }
      (await track_reactivity_loss(chrome.runtime.sendMessage({ type: "CLEAR_CAPTURED_DATA" })))();
      set(submitSuccess, true);
      setTimeout(() => $$props.onclose(), 1200);
    } catch (err) {
      set(submitError, err instanceof Error ? err.message : "Submission failed", true);
    } finally {
      set(submitting, false);
    }
  }
  function openSettings() {
    chrome.runtime.openOptionsPage?.();
  }
  function attachmentSummary() {
    const parts = [];
    if ($$props.screenshots.length > 0) parts.push(`${$$props.screenshots.length} screenshot${$$props.screenshots.length > 1 ? "s" : ""}`);
    if ($$props.consoleLogs.length > 0) parts.push(`${$$props.consoleLogs.length} console log${$$props.consoleLogs.length > 1 ? "s" : ""}`);
    if ($$props.selectedElements.length > 0) parts.push(`${$$props.selectedElements.length} element${$$props.selectedElements.length > 1 ? "s" : ""}`);
    return parts;
  }
  var $$exports = { ...legacy_api() };
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var div = root_1$5();
      var span = sibling(child(div), 2);
      var text2 = child(span);
      template_effect(() => set_text(text2, `Report submitted${get(configured) ? "" : " (saved locally)"}!`));
      append($$anchor2, div);
    };
    var alternate_1 = ($$anchor2) => {
      var form = root_2$4();
      var node_1 = child(form);
      {
        var consequent_1 = ($$anchor3) => {
          var div_1 = root_3$3();
          var button = sibling(child(div_1), 2);
          button.__click = openSettings;
          append($$anchor3, div_1);
        };
        add_svelte_meta(
          () => if_block(node_1, ($$render) => {
            if (strict_equals(get(configured), false)) $$render(consequent_1);
          }),
          "if",
          FeedbackForm,
          124,
          2
        );
      }
      var div_2 = sibling(node_1, 2);
      var input = sibling(child(div_2), 2);
      var div_3 = sibling(div_2, 2);
      var textarea = sibling(child(div_3), 2);
      var div_4 = sibling(div_3, 2);
      var div_5 = child(div_4);
      var select = sibling(child(div_5), 2);
      add_svelte_meta(
        () => each(select, 21, () => typeOptions, index, ($$anchor3, opt) => {
          var option = root_4$3();
          var text_1 = child(option, true);
          reset(option);
          var option_value = {};
          template_effect(() => {
            set_text(text_1, get(opt).label);
            if (option_value !== (option_value = get(opt).value)) {
              option.value = (option.__value = get(opt).value) ?? "";
            }
          });
          append($$anchor3, option);
        }),
        "each",
        FeedbackForm,
        158,
        8
      );
      var div_6 = sibling(div_5, 2);
      var select_1 = sibling(child(div_6), 2);
      add_svelte_meta(
        () => each(select_1, 21, () => priorityOptions, index, ($$anchor3, opt) => {
          var option_1 = root_5$1();
          var text_2 = child(option_1);
          reset(option_1);
          var option_1_value = {};
          template_effect(() => {
            set_text(text_2, `${get(opt).label ?? ""} - ${get(opt).desc ?? ""}`);
            if (option_1_value !== (option_1_value = get(opt).value)) {
              option_1.value = (option_1.__value = get(opt).value) ?? "";
            }
          });
          append($$anchor3, option_1);
        }),
        "each",
        FeedbackForm,
        167,
        8
      );
      var node_2 = sibling(div_4, 2);
      {
        var consequent_2 = ($$anchor3) => {
          var div_7 = root_6();
          var span_1 = sibling(child(div_7), 2);
          var text_3 = child(span_1);
          template_effect(($0) => set_text(text_3, `${$0 ?? ""} attached`), [() => attachmentSummary().join(", ")]);
          append($$anchor3, div_7);
        };
        add_svelte_meta(
          () => if_block(node_2, ($$render) => {
            if (attachmentSummary().length > 0) $$render(consequent_2);
          }),
          "if",
          FeedbackForm,
          174,
          2
        );
      }
      var node_3 = sibling(node_2, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var div_8 = root_7$1();
          var node_4 = child(div_8);
          add_svelte_meta(
            () => each(node_4, 17, () => $$props.screenshots.slice(-3), index, ($$anchor4, src, i) => {
              var img = root_8$1();
              set_attribute(img, "alt", `Attachment ${i + 1}`);
              template_effect(() => set_attribute(img, "src", get(src)));
              append($$anchor4, img);
            }),
            "each",
            FeedbackForm,
            183,
            6
          );
          var node_5 = sibling(node_4, 2);
          {
            var consequent_3 = ($$anchor4) => {
              var span_2 = root_9();
              var text_4 = child(span_2);
              template_effect(() => set_text(text_4, `+${$$props.screenshots.length - 3}`));
              append($$anchor4, span_2);
            };
            add_svelte_meta(
              () => if_block(node_5, ($$render) => {
                if ($$props.screenshots.length > 3) $$render(consequent_3);
              }),
              "if",
              FeedbackForm,
              186,
              6
            );
          }
          append($$anchor3, div_8);
        };
        add_svelte_meta(
          () => if_block(node_3, ($$render) => {
            if ($$props.screenshots.length > 0) $$render(consequent_4);
          }),
          "if",
          FeedbackForm,
          181,
          2
        );
      }
      var node_6 = sibling(node_3, 2);
      {
        var consequent_5 = ($$anchor3) => {
          var div_9 = root_10();
          var text_5 = child(div_9);
          template_effect(() => set_text(text_5, get(submitError)));
          append($$anchor3, div_9);
        };
        add_svelte_meta(
          () => if_block(node_6, ($$render) => {
            if (get(submitError)) $$render(consequent_5);
          }),
          "if",
          FeedbackForm,
          192,
          2
        );
      }
      var div_10 = sibling(node_6, 2);
      var button_1 = child(div_10);
      button_1.__click = function(...$$args) {
        apply(() => $$props.onclose, this, $$args, FeedbackForm, [197, 54]);
      };
      var button_2 = sibling(button_1, 2);
      var node_7 = child(button_2);
      {
        var consequent_6 = ($$anchor3) => {
          var fragment_1 = root_11();
          append($$anchor3, fragment_1);
        };
        var alternate = ($$anchor3) => {
          var text_6 = text("Submit Report");
          append($$anchor3, text_6);
        };
        add_svelte_meta(
          () => if_block(node_7, ($$render) => {
            if (get(submitting)) $$render(consequent_6);
            else $$render(alternate, false);
          }),
          "if",
          FeedbackForm,
          201,
          6
        );
      }
      template_effect(
        ($0) => {
          input.disabled = get(submitting);
          textarea.disabled = get(submitting);
          select.disabled = get(submitting);
          select_1.disabled = get(submitting);
          button_1.disabled = get(submitting);
          button_2.disabled = $0;
        },
        [() => get(submitting) || !get(title).trim()]
      );
      event("submit", form, handleSubmit);
      bind_value(
        input,
        function get$1() {
          return get(title);
        },
        function set$1($$value) {
          set(title, $$value);
        }
      );
      bind_value(
        textarea,
        function get$1() {
          return get(description);
        },
        function set$1($$value) {
          set(description, $$value);
        }
      );
      bind_select_value(
        select,
        function get$1() {
          return get(type);
        },
        function set$1($$value) {
          set(type, $$value);
        }
      );
      bind_select_value(
        select_1,
        function get$1() {
          return get(priority);
        },
        function set$1($$value) {
          set(priority, $$value);
        }
      );
      append($$anchor2, form);
    };
    add_svelte_meta(
      () => if_block(node, ($$render) => {
        if (get(submitSuccess)) $$render(consequent);
        else $$render(alternate_1, false);
      }),
      "if",
      FeedbackForm,
      117,
      0
    );
  }
  append($$anchor, fragment);
  return pop($$exports);
}
delegate(["click"]);
ScreenshotPreview[FILENAME] = "src/popup/components/ScreenshotPreview.svelte";
var root_2$3 = add_locations(from_html(`<div class="thumb-wrapper svelte-5eponf"><img class="thumb svelte-5eponf"/> <span class="thumb-index svelte-5eponf"></span></div>`), ScreenshotPreview[FILENAME], [[25, 8, [[26, 10], [27, 10]]]]);
var root_1$4 = add_locations(from_html(`<div class="thumbnails svelte-5eponf"></div>`), ScreenshotPreview[FILENAME], [[23, 4]]);
var root_4$2 = add_locations(from_html(`<div class="inline-thumb svelte-5eponf"><img class="thumb-sm svelte-5eponf" alt="Latest screenshot"/> <span class="thumb-hint svelte-5eponf">Latest capture</span></div>`), ScreenshotPreview[FILENAME], [[32, 4, [[33, 6], [34, 6]]]]);
var root$4 = add_locations(from_html(`<div class="preview svelte-5eponf"><button class="preview-header svelte-5eponf"><span class="preview-icon svelte-5eponf">&#x1f4f7;</span> <span class="preview-label svelte-5eponf"> </span> <span>&#x25b6;</span></button> <!></div>`), ScreenshotPreview[FILENAME], [[15, 0, [[16, 2, [[17, 4], [18, 4], [19, 4]]]]]]);
const $$css$4 = {
  hash: "svelte-5eponf",
  code: "\n  .preview.svelte-5eponf {\n    margin-bottom: 8px;\n    border: 1px solid #e5e7eb;\n    border-radius: 6px;\n    overflow: hidden;\n  }\n\n  .preview-header.svelte-5eponf {\n    width: 100%;\n    display: flex;\n    align-items: center;\n    gap: 6px;\n    padding: 8px 10px;\n    background: #f9fafb;\n    border: none;\n    cursor: pointer;\n    font-size: 12px;\n    color: #374151;\n    text-align: left;\n  }\n  .preview-header.svelte-5eponf:hover {\n    background: #f3f4f6;\n  }\n\n  .preview-icon.svelte-5eponf {\n    font-size: 13px;\n  }\n\n  .preview-label.svelte-5eponf {\n    flex: 1;\n    font-weight: 500;\n  }\n\n  .chevron.svelte-5eponf {\n    font-size: 10px;\n    color: #9ca3af;\n    transition: transform 0.15s;\n  }\n  .chevron.open.svelte-5eponf {\n    transform: rotate(90deg);\n  }\n\n  .thumbnails.svelte-5eponf {\n    display: flex;\n    gap: 6px;\n    padding: 8px;\n    overflow-x: auto;\n    background: #fff;\n  }\n\n  .thumb-wrapper.svelte-5eponf {\n    position: relative;\n    flex-shrink: 0;\n  }\n\n  .thumb.svelte-5eponf {\n    width: 100px;\n    height: 70px;\n    object-fit: cover;\n    border-radius: 4px;\n    border: 1px solid #e5e7eb;\n  }\n\n  .thumb-index.svelte-5eponf {\n    position: absolute;\n    top: 2px;\n    left: 2px;\n    background: rgba(0,0,0,0.6);\n    color: white;\n    font-size: 9px;\n    padding: 1px 4px;\n    border-radius: 3px;\n  }\n\n  .inline-thumb.svelte-5eponf {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    padding: 6px 10px;\n    background: #fff;\n  }\n\n  .thumb-sm.svelte-5eponf {\n    width: 48px;\n    height: 32px;\n    object-fit: cover;\n    border-radius: 3px;\n    border: 1px solid #e5e7eb;\n  }\n\n  .thumb-hint.svelte-5eponf {\n    font-size: 11px;\n    color: #9ca3af;\n  }\n\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2NyZWVuc2hvdFByZXZpZXcuc3ZlbHRlIiwic291cmNlcyI6WyJTY3JlZW5zaG90UHJldmlldy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdCBsYW5nPVwidHNcIj5cbiAgaW50ZXJmYWNlIFByb3BzIHtcbiAgICBzY3JlZW5zaG90czogc3RyaW5nW11cbiAgfVxuXG4gIGxldCB7IHNjcmVlbnNob3RzIH06IFByb3BzID0gJHByb3BzKClcbiAgbGV0IGV4cGFuZGVkID0gJHN0YXRlKGZhbHNlKVxuXG4gIC8vIFNob3cgdGhlIG1vc3QgcmVjZW50IHNjcmVlbnNob3QgYXMgdGh1bWJuYWlsXG4gICRlZmZlY3QoKCkgPT4ge1xuICAgIGlmIChzY3JlZW5zaG90cy5sZW5ndGggPT09IDApIGV4cGFuZGVkID0gZmFsc2VcbiAgfSlcbjwvc2NyaXB0PlxuXG48ZGl2IGNsYXNzPVwicHJldmlld1wiPlxuICA8YnV0dG9uIGNsYXNzPVwicHJldmlldy1oZWFkZXJcIiBvbmNsaWNrPXsoKSA9PiB7IGV4cGFuZGVkID0gIWV4cGFuZGVkIH19PlxuICAgIDxzcGFuIGNsYXNzPVwicHJldmlldy1pY29uXCI+JiN4MWY0Zjc7PC9zcGFuPlxuICAgIDxzcGFuIGNsYXNzPVwicHJldmlldy1sYWJlbFwiPlNjcmVlbnNob3RzICh7c2NyZWVuc2hvdHMubGVuZ3RofSk8L3NwYW4+XG4gICAgPHNwYW4gY2xhc3M9XCJjaGV2cm9uXCIgY2xhc3M6b3Blbj17ZXhwYW5kZWR9PiYjeDI1YjY7PC9zcGFuPlxuICA8L2J1dHRvbj5cblxuICB7I2lmIGV4cGFuZGVkfVxuICAgIDxkaXYgY2xhc3M9XCJ0aHVtYm5haWxzXCI+XG4gICAgICB7I2VhY2ggc2NyZWVuc2hvdHMgYXMgc3JjLCBpfVxuICAgICAgICA8ZGl2IGNsYXNzPVwidGh1bWItd3JhcHBlclwiPlxuICAgICAgICAgIDxpbWcgY2xhc3M9XCJ0aHVtYlwiIHNyYz17c3JjfSBhbHQ9XCJTY3JlZW5zaG90IHtpICsgMX1cIiAvPlxuICAgICAgICAgIDxzcGFuIGNsYXNzPVwidGh1bWItaW5kZXhcIj57aSArIDF9PC9zcGFuPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIHsvZWFjaH1cbiAgICA8L2Rpdj5cbiAgezplbHNlIGlmIHNjcmVlbnNob3RzLmxlbmd0aCA+IDB9XG4gICAgPGRpdiBjbGFzcz1cImlubGluZS10aHVtYlwiPlxuICAgICAgPGltZyBjbGFzcz1cInRodW1iLXNtXCIgc3JjPXtzY3JlZW5zaG90c1tzY3JlZW5zaG90cy5sZW5ndGggLSAxXX0gYWx0PVwiTGF0ZXN0IHNjcmVlbnNob3RcIiAvPlxuICAgICAgPHNwYW4gY2xhc3M9XCJ0aHVtYi1oaW50XCI+TGF0ZXN0IGNhcHR1cmU8L3NwYW4+XG4gICAgPC9kaXY+XG4gIHsvaWZ9XG48L2Rpdj5cblxuPHN0eWxlPlxuICAucHJldmlldyB7XG4gICAgbWFyZ2luLWJvdHRvbTogOHB4O1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNlNWU3ZWI7XG4gICAgYm9yZGVyLXJhZGl1czogNnB4O1xuICAgIG92ZXJmbG93OiBoaWRkZW47XG4gIH1cblxuICAucHJldmlldy1oZWFkZXIge1xuICAgIHdpZHRoOiAxMDAlO1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBnYXA6IDZweDtcbiAgICBwYWRkaW5nOiA4cHggMTBweDtcbiAgICBiYWNrZ3JvdW5kOiAjZjlmYWZiO1xuICAgIGJvcmRlcjogbm9uZTtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgZm9udC1zaXplOiAxMnB4O1xuICAgIGNvbG9yOiAjMzc0MTUxO1xuICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gIH1cbiAgLnByZXZpZXctaGVhZGVyOmhvdmVyIHtcbiAgICBiYWNrZ3JvdW5kOiAjZjNmNGY2O1xuICB9XG5cbiAgLnByZXZpZXctaWNvbiB7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICB9XG5cbiAgLnByZXZpZXctbGFiZWwge1xuICAgIGZsZXg6IDE7XG4gICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgfVxuXG4gIC5jaGV2cm9uIHtcbiAgICBmb250LXNpemU6IDEwcHg7XG4gICAgY29sb3I6ICM5Y2EzYWY7XG4gICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIDAuMTVzO1xuICB9XG4gIC5jaGV2cm9uLm9wZW4ge1xuICAgIHRyYW5zZm9ybTogcm90YXRlKDkwZGVnKTtcbiAgfVxuXG4gIC50aHVtYm5haWxzIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGdhcDogNnB4O1xuICAgIHBhZGRpbmc6IDhweDtcbiAgICBvdmVyZmxvdy14OiBhdXRvO1xuICAgIGJhY2tncm91bmQ6ICNmZmY7XG4gIH1cblxuICAudGh1bWItd3JhcHBlciB7XG4gICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgIGZsZXgtc2hyaW5rOiAwO1xuICB9XG5cbiAgLnRodW1iIHtcbiAgICB3aWR0aDogMTAwcHg7XG4gICAgaGVpZ2h0OiA3MHB4O1xuICAgIG9iamVjdC1maXQ6IGNvdmVyO1xuICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZTVlN2ViO1xuICB9XG5cbiAgLnRodW1iLWluZGV4IHtcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgdG9wOiAycHg7XG4gICAgbGVmdDogMnB4O1xuICAgIGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsMC42KTtcbiAgICBjb2xvcjogd2hpdGU7XG4gICAgZm9udC1zaXplOiA5cHg7XG4gICAgcGFkZGluZzogMXB4IDRweDtcbiAgICBib3JkZXItcmFkaXVzOiAzcHg7XG4gIH1cblxuICAuaW5saW5lLXRodW1iIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgZ2FwOiA4cHg7XG4gICAgcGFkZGluZzogNnB4IDEwcHg7XG4gICAgYmFja2dyb3VuZDogI2ZmZjtcbiAgfVxuXG4gIC50aHVtYi1zbSB7XG4gICAgd2lkdGg6IDQ4cHg7XG4gICAgaGVpZ2h0OiAzMnB4O1xuICAgIG9iamVjdC1maXQ6IGNvdmVyO1xuICAgIGJvcmRlci1yYWRpdXM6IDNweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZTVlN2ViO1xuICB9XG5cbiAgLnRodW1iLWhpbnQge1xuICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICBjb2xvcjogIzljYTNhZjtcbiAgfVxuPC9zdHlsZT5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiIiwiaWdub3JlTGlzdCI6W119 */"
};
function ScreenshotPreview($$anchor, $$props) {
  check_target(new.target);
  push($$props, true, ScreenshotPreview);
  append_styles($$anchor, $$css$4);
  let expanded = tag(state(false), "expanded");
  user_effect(() => {
    if (strict_equals($$props.screenshots.length, 0)) set(expanded, false);
  });
  var $$exports = { ...legacy_api() };
  var div = root$4();
  var button = child(div);
  button.__click = () => {
    set(expanded, !get(expanded));
  };
  var span = sibling(child(button), 2);
  var text2 = child(span);
  var span_1 = sibling(span, 2);
  let classes;
  var node = sibling(button, 2);
  {
    var consequent = ($$anchor2) => {
      var div_1 = root_1$4();
      add_svelte_meta(
        () => each(div_1, 21, () => $$props.screenshots, index, ($$anchor3, src, i) => {
          var div_2 = root_2$3();
          var img = child(div_2);
          set_attribute(img, "alt", `Screenshot ${i + 1}`);
          var span_2 = sibling(img, 2);
          span_2.textContent = i + 1;
          reset(div_2);
          template_effect(() => set_attribute(img, "src", get(src)));
          append($$anchor3, div_2);
        }),
        "each",
        ScreenshotPreview,
        24,
        6
      );
      append($$anchor2, div_1);
    };
    var alternate = ($$anchor2) => {
      var fragment = comment();
      var node_1 = first_child(fragment);
      {
        var consequent_1 = ($$anchor3) => {
          var div_3 = root_4$2();
          var img_1 = child(div_3);
          template_effect(() => set_attribute(img_1, "src", $$props.screenshots[$$props.screenshots.length - 1]));
          append($$anchor3, div_3);
        };
        add_svelte_meta(
          () => if_block(
            node_1,
            ($$render) => {
              if ($$props.screenshots.length > 0) $$render(consequent_1);
            },
            true
          ),
          "if",
          ScreenshotPreview,
          31,
          2
        );
      }
      append($$anchor2, fragment);
    };
    add_svelte_meta(
      () => if_block(node, ($$render) => {
        if (get(expanded)) $$render(consequent);
        else $$render(alternate, false);
      }),
      "if",
      ScreenshotPreview,
      22,
      2
    );
  }
  template_effect(() => {
    set_text(text2, `Screenshots (${$$props.screenshots.length ?? ""})`);
    classes = set_class(span_1, 1, "chevron svelte-5eponf", null, classes, { open: get(expanded) });
  });
  append($$anchor, div);
  return pop($$exports);
}
delegate(["click"]);
ElementPreview[FILENAME] = "src/popup/components/ElementPreview.svelte";
var root_3$2 = add_locations(from_html(`<div class="element-text svelte-inaxlf"> </div>`), ElementPreview[FILENAME], [[27, 12]]);
var root_4$1 = add_locations(from_html(`<code class="meta-selector svelte-inaxlf"> </code>`), ElementPreview[FILENAME], [[32, 14]]);
var root_5 = add_locations(from_html(`<img class="element-thumb svelte-inaxlf"/>`), ElementPreview[FILENAME], [[36, 12]]);
var root_2$2 = add_locations(from_html(`<div class="element-item svelte-inaxlf"><div class="element-tag svelte-inaxlf"><code class="svelte-inaxlf"> </code></div> <!> <div class="element-meta svelte-inaxlf"><span class="meta-item svelte-inaxlf"> </span> <!></div> <!></div>`), ElementPreview[FILENAME], [[22, 8, [[23, 10, [[24, 12]]], [29, 10, [[30, 12]]]]]]);
var root_1$3 = add_locations(from_html(`<div class="elements-list svelte-inaxlf"></div>`), ElementPreview[FILENAME], [[20, 4]]);
var root_8 = add_locations(from_html(`<span class="text-inline svelte-inaxlf"> </span>`), ElementPreview[FILENAME], [[46, 8]]);
var root_7 = add_locations(from_html(`<div class="inline-preview svelte-inaxlf"><code class="tag-inline svelte-inaxlf"> </code> <!></div>`), ElementPreview[FILENAME], [[43, 4, [[44, 6]]]]);
var root$3 = add_locations(from_html(`<div class="preview svelte-inaxlf"><button class="preview-header svelte-inaxlf"><span class="preview-icon svelte-inaxlf">&#x1f3af;</span> <span class="preview-label svelte-inaxlf"> </span> <span>&#x25b6;</span></button> <!></div>`), ElementPreview[FILENAME], [[12, 0, [[13, 2, [[14, 4], [15, 4], [16, 4]]]]]]);
const $$css$3 = {
  hash: "svelte-inaxlf",
  code: "\n  .preview.svelte-inaxlf {\n    margin-bottom: 8px;\n    border: 1px solid #e5e7eb;\n    border-radius: 6px;\n    overflow: hidden;\n  }\n\n  .preview-header.svelte-inaxlf {\n    width: 100%;\n    display: flex;\n    align-items: center;\n    gap: 6px;\n    padding: 8px 10px;\n    background: #f9fafb;\n    border: none;\n    cursor: pointer;\n    font-size: 12px;\n    color: #374151;\n    text-align: left;\n  }\n  .preview-header.svelte-inaxlf:hover {\n    background: #f3f4f6;\n  }\n\n  .preview-icon.svelte-inaxlf {\n    font-size: 13px;\n  }\n\n  .preview-label.svelte-inaxlf {\n    flex: 1;\n    font-weight: 500;\n  }\n\n  .chevron.svelte-inaxlf {\n    font-size: 10px;\n    color: #9ca3af;\n    transition: transform 0.15s;\n  }\n  .chevron.open.svelte-inaxlf {\n    transform: rotate(90deg);\n  }\n\n  .elements-list.svelte-inaxlf {\n    padding: 8px;\n    background: #fff;\n    display: flex;\n    flex-direction: column;\n    gap: 8px;\n    max-height: 200px;\n    overflow-y: auto;\n  }\n\n  .element-item.svelte-inaxlf {\n    padding: 6px 8px;\n    border: 1px solid #e5e7eb;\n    border-radius: 4px;\n    background: #fafafa;\n  }\n\n  .element-tag.svelte-inaxlf {\n    margin-bottom: 2px;\n  }\n  .element-tag.svelte-inaxlf code:where(.svelte-inaxlf) {\n    font-size: 12px;\n    color: #7c3aed;\n    background: #f5f3ff;\n    padding: 1px 4px;\n    border-radius: 3px;\n  }\n\n  .element-text.svelte-inaxlf {\n    font-size: 11px;\n    color: #6b7280;\n    margin-bottom: 4px;\n  }\n\n  .element-meta.svelte-inaxlf {\n    display: flex;\n    gap: 8px;\n    align-items: center;\n    font-size: 10px;\n  }\n\n  .meta-item.svelte-inaxlf {\n    color: #9ca3af;\n  }\n\n  .meta-selector.svelte-inaxlf {\n    color: #9ca3af;\n    font-size: 10px;\n    background: #f3f4f6;\n    padding: 1px 3px;\n    border-radius: 2px;\n  }\n\n  .element-thumb.svelte-inaxlf {\n    margin-top: 4px;\n    max-width: 100%;\n    max-height: 60px;\n    object-fit: contain;\n    border-radius: 3px;\n    border: 1px solid #e5e7eb;\n  }\n\n  .inline-preview.svelte-inaxlf {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    padding: 6px 10px;\n    background: #fff;\n  }\n\n  .tag-inline.svelte-inaxlf {\n    font-size: 12px;\n    color: #7c3aed;\n    background: #f5f3ff;\n    padding: 1px 4px;\n    border-radius: 3px;\n  }\n\n  .text-inline.svelte-inaxlf {\n    font-size: 11px;\n    color: #9ca3af;\n  }\n\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWxlbWVudFByZXZpZXcuc3ZlbHRlIiwic291cmNlcyI6WyJFbGVtZW50UHJldmlldy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdCBsYW5nPVwidHNcIj5cbiAgaW1wb3J0IHR5cGUgeyBFbGVtZW50RGF0YSB9IGZyb20gJy4uL3N0b3Jlcy9jYXB0dXJlZERhdGEuc3ZlbHRlJ1xuXG4gIGludGVyZmFjZSBQcm9wcyB7XG4gICAgZWxlbWVudHM6IEVsZW1lbnREYXRhW11cbiAgfVxuXG4gIGxldCB7IGVsZW1lbnRzIH06IFByb3BzID0gJHByb3BzKClcbiAgbGV0IGV4cGFuZGVkID0gJHN0YXRlKGZhbHNlKVxuPC9zY3JpcHQ+XG5cbjxkaXYgY2xhc3M9XCJwcmV2aWV3XCI+XG4gIDxidXR0b24gY2xhc3M9XCJwcmV2aWV3LWhlYWRlclwiIG9uY2xpY2s9eygpID0+IHsgZXhwYW5kZWQgPSAhZXhwYW5kZWQgfX0+XG4gICAgPHNwYW4gY2xhc3M9XCJwcmV2aWV3LWljb25cIj4mI3gxZjNhZjs8L3NwYW4+XG4gICAgPHNwYW4gY2xhc3M9XCJwcmV2aWV3LWxhYmVsXCI+U2VsZWN0ZWQgRWxlbWVudHMgKHtlbGVtZW50cy5sZW5ndGh9KTwvc3Bhbj5cbiAgICA8c3BhbiBjbGFzcz1cImNoZXZyb25cIiBjbGFzczpvcGVuPXtleHBhbmRlZH0+JiN4MjViNjs8L3NwYW4+XG4gIDwvYnV0dG9uPlxuXG4gIHsjaWYgZXhwYW5kZWR9XG4gICAgPGRpdiBjbGFzcz1cImVsZW1lbnRzLWxpc3RcIj5cbiAgICAgIHsjZWFjaCBlbGVtZW50cyBhcyBlbCwgaX1cbiAgICAgICAgPGRpdiBjbGFzcz1cImVsZW1lbnQtaXRlbVwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJlbGVtZW50LXRhZ1wiPlxuICAgICAgICAgICAgPGNvZGU+Jmx0O3tlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCl9e2VsLmlkID8gYCMke2VsLmlkfWAgOiAnJ317ZWwuY2xhc3NOYW1lID8gYC4ke2VsLmNsYXNzTmFtZS5zcGxpdCgnICcpWzBdfWAgOiAnJ30mZ3Q7PC9jb2RlPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIHsjaWYgZWwudGV4dENvbnRlbnR9XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZWxlbWVudC10ZXh0XCI+e2VsLnRleHRDb250ZW50LnNsaWNlKDAsIDYwKX17ZWwudGV4dENvbnRlbnQubGVuZ3RoID4gNjAgPyAnLi4uJyA6ICcnfTwvZGl2PlxuICAgICAgICAgIHsvaWZ9XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImVsZW1lbnQtbWV0YVwiPlxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJtZXRhLWl0ZW1cIj57TWF0aC5yb3VuZChlbC5ib3VuZGluZ1JlY3Qud2lkdGgpfXh7TWF0aC5yb3VuZChlbC5ib3VuZGluZ1JlY3QuaGVpZ2h0KX08L3NwYW4+XG4gICAgICAgICAgICB7I2lmIGVsLnNlbGVjdG9yfVxuICAgICAgICAgICAgICA8Y29kZSBjbGFzcz1cIm1ldGEtc2VsZWN0b3JcIiB0aXRsZT17ZWwuc2VsZWN0b3J9PntlbC5zZWxlY3Rvci5sZW5ndGggPiA0MCA/IGVsLnNlbGVjdG9yLnNsaWNlKDAsIDQwKSArICcuLi4nIDogZWwuc2VsZWN0b3J9PC9jb2RlPlxuICAgICAgICAgICAgey9pZn1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICB7I2lmIGVsLnNjcmVlbnNob3R9XG4gICAgICAgICAgICA8aW1nIGNsYXNzPVwiZWxlbWVudC10aHVtYlwiIHNyYz17ZWwuc2NyZWVuc2hvdH0gYWx0PVwiRWxlbWVudCB7aSArIDF9XCIgLz5cbiAgICAgICAgICB7L2lmfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIHsvZWFjaH1cbiAgICA8L2Rpdj5cbiAgezplbHNlIGlmIGVsZW1lbnRzLmxlbmd0aCA+IDB9XG4gICAge0Bjb25zdCBsYXRlc3QgPSBlbGVtZW50c1tlbGVtZW50cy5sZW5ndGggLSAxXX1cbiAgICA8ZGl2IGNsYXNzPVwiaW5saW5lLXByZXZpZXdcIj5cbiAgICAgIDxjb2RlIGNsYXNzPVwidGFnLWlubGluZVwiPiZsdDt7bGF0ZXN0LnRhZ05hbWUudG9Mb3dlckNhc2UoKX0mZ3Q7PC9jb2RlPlxuICAgICAgeyNpZiBsYXRlc3QudGV4dENvbnRlbnR9XG4gICAgICAgIDxzcGFuIGNsYXNzPVwidGV4dC1pbmxpbmVcIj57bGF0ZXN0LnRleHRDb250ZW50LnNsaWNlKDAsIDMwKX0uLi48L3NwYW4+XG4gICAgICB7L2lmfVxuICAgIDwvZGl2PlxuICB7L2lmfVxuPC9kaXY+XG5cbjxzdHlsZT5cbiAgLnByZXZpZXcge1xuICAgIG1hcmdpbi1ib3R0b206IDhweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZTVlN2ViO1xuICAgIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgICBvdmVyZmxvdzogaGlkZGVuO1xuICB9XG5cbiAgLnByZXZpZXctaGVhZGVyIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgZ2FwOiA2cHg7XG4gICAgcGFkZGluZzogOHB4IDEwcHg7XG4gICAgYmFja2dyb3VuZDogI2Y5ZmFmYjtcbiAgICBib3JkZXI6IG5vbmU7XG4gICAgY3Vyc29yOiBwb2ludGVyO1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICBjb2xvcjogIzM3NDE1MTtcbiAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICB9XG4gIC5wcmV2aWV3LWhlYWRlcjpob3ZlciB7XG4gICAgYmFja2dyb3VuZDogI2YzZjRmNjtcbiAgfVxuXG4gIC5wcmV2aWV3LWljb24ge1xuICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgfVxuXG4gIC5wcmV2aWV3LWxhYmVsIHtcbiAgICBmbGV4OiAxO1xuICAgIGZvbnQtd2VpZ2h0OiA1MDA7XG4gIH1cblxuICAuY2hldnJvbiB7XG4gICAgZm9udC1zaXplOiAxMHB4O1xuICAgIGNvbG9yOiAjOWNhM2FmO1xuICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE1cztcbiAgfVxuICAuY2hldnJvbi5vcGVuIHtcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSg5MGRlZyk7XG4gIH1cblxuICAuZWxlbWVudHMtbGlzdCB7XG4gICAgcGFkZGluZzogOHB4O1xuICAgIGJhY2tncm91bmQ6ICNmZmY7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgIGdhcDogOHB4O1xuICAgIG1heC1oZWlnaHQ6IDIwMHB4O1xuICAgIG92ZXJmbG93LXk6IGF1dG87XG4gIH1cblxuICAuZWxlbWVudC1pdGVtIHtcbiAgICBwYWRkaW5nOiA2cHggOHB4O1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNlNWU3ZWI7XG4gICAgYm9yZGVyLXJhZGl1czogNHB4O1xuICAgIGJhY2tncm91bmQ6ICNmYWZhZmE7XG4gIH1cblxuICAuZWxlbWVudC10YWcge1xuICAgIG1hcmdpbi1ib3R0b206IDJweDtcbiAgfVxuICAuZWxlbWVudC10YWcgY29kZSB7XG4gICAgZm9udC1zaXplOiAxMnB4O1xuICAgIGNvbG9yOiAjN2MzYWVkO1xuICAgIGJhY2tncm91bmQ6ICNmNWYzZmY7XG4gICAgcGFkZGluZzogMXB4IDRweDtcbiAgICBib3JkZXItcmFkaXVzOiAzcHg7XG4gIH1cblxuICAuZWxlbWVudC10ZXh0IHtcbiAgICBmb250LXNpemU6IDExcHg7XG4gICAgY29sb3I6ICM2YjcyODA7XG4gICAgbWFyZ2luLWJvdHRvbTogNHB4O1xuICB9XG5cbiAgLmVsZW1lbnQtbWV0YSB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBnYXA6IDhweDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgfVxuXG4gIC5tZXRhLWl0ZW0ge1xuICAgIGNvbG9yOiAjOWNhM2FmO1xuICB9XG5cbiAgLm1ldGEtc2VsZWN0b3Ige1xuICAgIGNvbG9yOiAjOWNhM2FmO1xuICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICBiYWNrZ3JvdW5kOiAjZjNmNGY2O1xuICAgIHBhZGRpbmc6IDFweCAzcHg7XG4gICAgYm9yZGVyLXJhZGl1czogMnB4O1xuICB9XG5cbiAgLmVsZW1lbnQtdGh1bWIge1xuICAgIG1hcmdpbi10b3A6IDRweDtcbiAgICBtYXgtd2lkdGg6IDEwMCU7XG4gICAgbWF4LWhlaWdodDogNjBweDtcbiAgICBvYmplY3QtZml0OiBjb250YWluO1xuICAgIGJvcmRlci1yYWRpdXM6IDNweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZTVlN2ViO1xuICB9XG5cbiAgLmlubGluZS1wcmV2aWV3IHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgZ2FwOiA4cHg7XG4gICAgcGFkZGluZzogNnB4IDEwcHg7XG4gICAgYmFja2dyb3VuZDogI2ZmZjtcbiAgfVxuXG4gIC50YWctaW5saW5lIHtcbiAgICBmb250LXNpemU6IDEycHg7XG4gICAgY29sb3I6ICM3YzNhZWQ7XG4gICAgYmFja2dyb3VuZDogI2Y1ZjNmZjtcbiAgICBwYWRkaW5nOiAxcHggNHB4O1xuICAgIGJvcmRlci1yYWRpdXM6IDNweDtcbiAgfVxuXG4gIC50ZXh0LWlubGluZSB7XG4gICAgZm9udC1zaXplOiAxMXB4O1xuICAgIGNvbG9yOiAjOWNhM2FmO1xuICB9XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiIiLCJpZ25vcmVMaXN0IjpbXX0= */"
};
function ElementPreview($$anchor, $$props) {
  check_target(new.target);
  push($$props, true, ElementPreview);
  append_styles($$anchor, $$css$3);
  let expanded = tag(state(false), "expanded");
  var $$exports = { ...legacy_api() };
  var div = root$3();
  var button = child(div);
  button.__click = () => {
    set(expanded, !get(expanded));
  };
  var span = sibling(child(button), 2);
  var text2 = child(span);
  var span_1 = sibling(span, 2);
  let classes;
  var node = sibling(button, 2);
  {
    var consequent_3 = ($$anchor2) => {
      var div_1 = root_1$3();
      add_svelte_meta(
        () => each(div_1, 21, () => $$props.elements, index, ($$anchor3, el, i) => {
          var div_2 = root_2$2();
          var div_3 = child(div_2);
          var code = child(div_3);
          var text_1 = child(code);
          reset(code);
          reset(div_3);
          var node_1 = sibling(div_3, 2);
          {
            var consequent = ($$anchor4) => {
              var div_4 = root_3$2();
              var text_2 = child(div_4);
              reset(div_4);
              template_effect(($0) => set_text(text_2, `${$0 ?? ""}${get(el).textContent.length > 60 ? "..." : ""}`), [() => get(el).textContent.slice(0, 60)]);
              append($$anchor4, div_4);
            };
            add_svelte_meta(
              () => if_block(node_1, ($$render) => {
                if (get(el).textContent) $$render(consequent);
              }),
              "if",
              ElementPreview,
              26,
              10
            );
          }
          var div_5 = sibling(node_1, 2);
          var span_2 = child(div_5);
          var text_3 = child(span_2);
          reset(span_2);
          var node_2 = sibling(span_2, 2);
          {
            var consequent_1 = ($$anchor4) => {
              var code_1 = root_4$1();
              var text_4 = child(code_1, true);
              reset(code_1);
              template_effect(
                ($0) => {
                  set_attribute(code_1, "title", get(el).selector);
                  set_text(text_4, $0);
                },
                [
                  () => get(el).selector.length > 40 ? get(el).selector.slice(0, 40) + "..." : get(el).selector
                ]
              );
              append($$anchor4, code_1);
            };
            add_svelte_meta(
              () => if_block(node_2, ($$render) => {
                if (get(el).selector) $$render(consequent_1);
              }),
              "if",
              ElementPreview,
              31,
              12
            );
          }
          reset(div_5);
          var node_3 = sibling(div_5, 2);
          {
            var consequent_2 = ($$anchor4) => {
              var img = root_5();
              set_attribute(img, "alt", `Element ${i + 1}`);
              template_effect(() => set_attribute(img, "src", get(el).screenshot));
              append($$anchor4, img);
            };
            add_svelte_meta(
              () => if_block(node_3, ($$render) => {
                if (get(el).screenshot) $$render(consequent_2);
              }),
              "if",
              ElementPreview,
              35,
              10
            );
          }
          reset(div_2);
          template_effect(
            ($0, $1, $2, $3) => {
              set_text(text_1, `<${$0 ?? ""}${get(el).id ? `#${get(el).id}` : ""}${$1 ?? ""}>`);
              set_text(text_3, `${$2 ?? ""}x${$3 ?? ""}`);
            },
            [
              () => get(el).tagName.toLowerCase(),
              () => get(el).className ? `.${get(el).className.split(" ")[0]}` : "",
              () => Math.round(get(el).boundingRect.width),
              () => Math.round(get(el).boundingRect.height)
            ]
          );
          append($$anchor3, div_2);
        }),
        "each",
        ElementPreview,
        21,
        6
      );
      append($$anchor2, div_1);
    };
    var alternate = ($$anchor2) => {
      var fragment = comment();
      var node_4 = first_child(fragment);
      {
        var consequent_5 = ($$anchor3) => {
          const latest = tag(user_derived(() => $$props.elements[$$props.elements.length - 1]), "latest");
          get(latest);
          var div_6 = root_7();
          var code_2 = child(div_6);
          var text_5 = child(code_2);
          var node_5 = sibling(code_2, 2);
          {
            var consequent_4 = ($$anchor4) => {
              var span_3 = root_8();
              var text_6 = child(span_3);
              template_effect(($0) => set_text(text_6, `${$0 ?? ""}...`), [() => get(latest).textContent.slice(0, 30)]);
              append($$anchor4, span_3);
            };
            add_svelte_meta(
              () => if_block(node_5, ($$render) => {
                if (get(latest).textContent) $$render(consequent_4);
              }),
              "if",
              ElementPreview,
              45,
              6
            );
          }
          template_effect(($0) => set_text(text_5, `<${$0 ?? ""}>`), [() => get(latest).tagName.toLowerCase()]);
          append($$anchor3, div_6);
        };
        add_svelte_meta(
          () => if_block(
            node_4,
            ($$render) => {
              if ($$props.elements.length > 0) $$render(consequent_5);
            },
            true
          ),
          "if",
          ElementPreview,
          41,
          2
        );
      }
      append($$anchor2, fragment);
    };
    add_svelte_meta(
      () => if_block(node, ($$render) => {
        if (get(expanded)) $$render(consequent_3);
        else $$render(alternate, false);
      }),
      "if",
      ElementPreview,
      19,
      2
    );
  }
  template_effect(() => {
    set_text(text2, `Selected Elements (${$$props.elements.length ?? ""})`);
    classes = set_class(span_1, 1, "chevron svelte-inaxlf", null, classes, { open: get(expanded) });
  });
  append($$anchor, div);
  return pop($$exports);
}
delegate(["click"]);
ConsoleLogPreview[FILENAME] = "src/popup/components/ConsoleLogPreview.svelte";
var root_1$2 = add_locations(from_html(`<span class="badge svelte-1mjkfxc"> </span>`), ConsoleLogPreview[FILENAME], [[49, 8]]);
var root_4 = add_locations(from_html(`<div class="log-source svelte-1mjkfxc"> </div>`), ConsoleLogPreview[FILENAME], [[67, 12]]);
var root_3$1 = add_locations(from_html(`<div class="log-entry svelte-1mjkfxc"><div class="log-header svelte-1mjkfxc"><span class="log-type svelte-1mjkfxc"> </span> <span class="log-time svelte-1mjkfxc"> </span></div> <div class="log-message svelte-1mjkfxc"> </div> <!></div>`), ConsoleLogPreview[FILENAME], [[60, 8, [[61, 10, [[62, 12], [63, 12]]], [65, 10]]]]);
var root_2$1 = add_locations(from_html(`<div class="logs-list svelte-1mjkfxc"></div>`), ConsoleLogPreview[FILENAME], [[58, 4]]);
var root$2 = add_locations(from_html(`<div class="preview svelte-1mjkfxc"><button class="preview-header svelte-1mjkfxc"><span class="preview-icon svelte-1mjkfxc">&#x1f41b;</span> <span class="preview-label svelte-1mjkfxc"> </span> <div class="type-badges svelte-1mjkfxc"></div> <span>&#x25b6;</span></button> <!></div>`), ConsoleLogPreview[FILENAME], [[43, 0, [[44, 2, [[45, 4], [46, 4], [47, 4], [54, 4]]]]]]);
const $$css$2 = {
  hash: "svelte-1mjkfxc",
  code: "\n  .preview.svelte-1mjkfxc {\n    margin-bottom: 8px;\n    border: 1px solid #e5e7eb;\n    border-radius: 6px;\n    overflow: hidden;\n  }\n\n  .preview-header.svelte-1mjkfxc {\n    width: 100%;\n    display: flex;\n    align-items: center;\n    gap: 6px;\n    padding: 8px 10px;\n    background: #f9fafb;\n    border: none;\n    cursor: pointer;\n    font-size: 12px;\n    color: #374151;\n    text-align: left;\n  }\n  .preview-header.svelte-1mjkfxc:hover {\n    background: #f3f4f6;\n  }\n\n  .preview-icon.svelte-1mjkfxc {\n    font-size: 13px;\n  }\n\n  .preview-label.svelte-1mjkfxc {\n    font-weight: 500;\n    white-space: nowrap;\n  }\n\n  .type-badges.svelte-1mjkfxc {\n    display: flex;\n    gap: 3px;\n    flex: 1;\n    justify-content: flex-end;\n    flex-wrap: wrap;\n  }\n\n  .badge.svelte-1mjkfxc {\n    font-size: 9px;\n    padding: 1px 5px;\n    border-radius: 3px;\n    font-weight: 500;\n  }\n\n  .chevron.svelte-1mjkfxc {\n    font-size: 10px;\n    color: #9ca3af;\n    transition: transform 0.15s;\n    flex-shrink: 0;\n  }\n  .chevron.open.svelte-1mjkfxc {\n    transform: rotate(90deg);\n  }\n\n  .logs-list.svelte-1mjkfxc {\n    max-height: 250px;\n    overflow-y: auto;\n    background: #fff;\n    padding: 4px;\n  }\n\n  .log-entry.svelte-1mjkfxc {\n    padding: 4px 8px;\n    border-left: 3px solid #d1d5db;\n    margin-bottom: 2px;\n    font-size: 11px;\n    font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;\n  }\n\n  .log-header.svelte-1mjkfxc {\n    display: flex;\n    justify-content: space-between;\n    margin-bottom: 1px;\n  }\n\n  .log-type.svelte-1mjkfxc {\n    font-weight: 600;\n    text-transform: uppercase;\n    font-size: 9px;\n    letter-spacing: 0.5px;\n  }\n\n  .log-time.svelte-1mjkfxc {\n    color: #9ca3af;\n    font-size: 10px;\n  }\n\n  .log-message.svelte-1mjkfxc {\n    color: #374151;\n    word-break: break-word;\n    white-space: pre-wrap;\n  }\n\n  .log-source.svelte-1mjkfxc {\n    color: #9ca3af;\n    font-size: 10px;\n    margin-top: 1px;\n  }\n\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ29uc29sZUxvZ1ByZXZpZXcuc3ZlbHRlIiwic291cmNlcyI6WyJDb25zb2xlTG9nUHJldmlldy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdCBsYW5nPVwidHNcIj5cbiAgaW1wb3J0IHR5cGUgeyBDb25zb2xlTG9nRW50cnkgfSBmcm9tICcuLi9zdG9yZXMvY2FwdHVyZWREYXRhLnN2ZWx0ZSdcblxuICBpbnRlcmZhY2UgUHJvcHMge1xuICAgIGxvZ3M6IENvbnNvbGVMb2dFbnRyeVtdXG4gIH1cblxuICBsZXQgeyBsb2dzIH06IFByb3BzID0gJHByb3BzKClcbiAgbGV0IGV4cGFuZGVkID0gJHN0YXRlKGZhbHNlKVxuXG4gIGNvbnN0IHR5cGVDb2xvcnM6IFJlY29yZDxzdHJpbmcsIHsgYmc6IHN0cmluZzsgdGV4dDogc3RyaW5nIH0+ID0ge1xuICAgIGVycm9yOiB7IGJnOiAnI2ZlZjJmMicsIHRleHQ6ICcjZGMyNjI2JyB9LFxuICAgIHdhcm46IHsgYmc6ICcjZmZmYmViJywgdGV4dDogJyNkOTc3MDYnIH0sXG4gICAgbG9nOiB7IGJnOiAnI2Y5ZmFmYicsIHRleHQ6ICcjMzc0MTUxJyB9LFxuICAgIGluZm86IHsgYmc6ICcjZWZmNmZmJywgdGV4dDogJyMyNTYzZWInIH0sXG4gICAgZGVidWc6IHsgYmc6ICcjZjVmM2ZmJywgdGV4dDogJyM3YzNhZWQnIH0sXG4gICAgdHJhY2U6IHsgYmc6ICcjZjBmZGY0JywgdGV4dDogJyMxNmEzNGEnIH0sXG4gIH1cblxuICBmdW5jdGlvbiBnZXRDb2xvcih0eXBlOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdHlwZUNvbG9yc1t0eXBlXSB8fCB0eXBlQ29sb3JzLmxvZ1xuICB9XG5cbiAgLy8gQ291bnQgYnkgdHlwZVxuICBmdW5jdGlvbiB0eXBlQ291bnRzKGVudHJpZXM6IENvbnNvbGVMb2dFbnRyeVtdKSB7XG4gICAgY29uc3QgY291bnRzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge31cbiAgICBmb3IgKGNvbnN0IGUgb2YgZW50cmllcykge1xuICAgICAgY291bnRzW2UudHlwZV0gPSAoY291bnRzW2UudHlwZV0gfHwgMCkgKyAxXG4gICAgfVxuICAgIHJldHVybiBjb3VudHNcbiAgfVxuXG4gIGZ1bmN0aW9uIGZvcm1hdFRpbWUodHM6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGQgPSBuZXcgRGF0ZSh0cylcbiAgICAgIHJldHVybiBkLnRvTG9jYWxlVGltZVN0cmluZyhbXSwgeyBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnLCBzZWNvbmQ6ICcyLWRpZ2l0JyB9KVxuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuICcnXG4gICAgfVxuICB9XG48L3NjcmlwdD5cblxuPGRpdiBjbGFzcz1cInByZXZpZXdcIj5cbiAgPGJ1dHRvbiBjbGFzcz1cInByZXZpZXctaGVhZGVyXCIgb25jbGljaz17KCkgPT4geyBleHBhbmRlZCA9ICFleHBhbmRlZCB9fT5cbiAgICA8c3BhbiBjbGFzcz1cInByZXZpZXctaWNvblwiPiYjeDFmNDFiOzwvc3Bhbj5cbiAgICA8c3BhbiBjbGFzcz1cInByZXZpZXctbGFiZWxcIj5Db25zb2xlIExvZ3MgKHtsb2dzLmxlbmd0aH0pPC9zcGFuPlxuICAgIDxkaXYgY2xhc3M9XCJ0eXBlLWJhZGdlc1wiPlxuICAgICAgeyNlYWNoIE9iamVjdC5lbnRyaWVzKHR5cGVDb3VudHMobG9ncykpIGFzIFt0eXBlLCBjb3VudF19XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiYmFkZ2VcIiBzdHlsZT1cImJhY2tncm91bmQ6IHtnZXRDb2xvcih0eXBlKS5iZ307IGNvbG9yOiB7Z2V0Q29sb3IodHlwZSkudGV4dH1cIj5cbiAgICAgICAgICB7Y291bnR9IHt0eXBlfVxuICAgICAgICA8L3NwYW4+XG4gICAgICB7L2VhY2h9XG4gICAgPC9kaXY+XG4gICAgPHNwYW4gY2xhc3M9XCJjaGV2cm9uXCIgY2xhc3M6b3Blbj17ZXhwYW5kZWR9PiYjeDI1YjY7PC9zcGFuPlxuICA8L2J1dHRvbj5cblxuICB7I2lmIGV4cGFuZGVkfVxuICAgIDxkaXYgY2xhc3M9XCJsb2dzLWxpc3RcIj5cbiAgICAgIHsjZWFjaCBsb2dzIGFzIGVudHJ5fVxuICAgICAgICA8ZGl2IGNsYXNzPVwibG9nLWVudHJ5XCIgc3R5bGU9XCJib3JkZXItbGVmdC1jb2xvcjoge2dldENvbG9yKGVudHJ5LnR5cGUpLnRleHR9XCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImxvZy1oZWFkZXJcIj5cbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibG9nLXR5cGVcIiBzdHlsZT1cImNvbG9yOiB7Z2V0Q29sb3IoZW50cnkudHlwZSkudGV4dH1cIj57ZW50cnkudHlwZX08L3NwYW4+XG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImxvZy10aW1lXCI+e2Zvcm1hdFRpbWUoZW50cnkudGltZXN0YW1wKX08L3NwYW4+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImxvZy1tZXNzYWdlXCI+e2VudHJ5Lm1lc3NhZ2Uuc2xpY2UoMCwgMjAwKX17ZW50cnkubWVzc2FnZS5sZW5ndGggPiAyMDAgPyAnLi4uJyA6ICcnfTwvZGl2PlxuICAgICAgICAgIHsjaWYgZW50cnkuZmlsZU5hbWV9XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibG9nLXNvdXJjZVwiPntlbnRyeS5maWxlTmFtZX17ZW50cnkubGluZU51bWJlciA/IGA6JHtlbnRyeS5saW5lTnVtYmVyfWAgOiAnJ308L2Rpdj5cbiAgICAgICAgICB7L2lmfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIHsvZWFjaH1cbiAgICA8L2Rpdj5cbiAgey9pZn1cbjwvZGl2PlxuXG48c3R5bGU+XG4gIC5wcmV2aWV3IHtcbiAgICBtYXJnaW4tYm90dG9tOiA4cHg7XG4gICAgYm9yZGVyOiAxcHggc29saWQgI2U1ZTdlYjtcbiAgICBib3JkZXItcmFkaXVzOiA2cHg7XG4gICAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgfVxuXG4gIC5wcmV2aWV3LWhlYWRlciB7XG4gICAgd2lkdGg6IDEwMCU7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGdhcDogNnB4O1xuICAgIHBhZGRpbmc6IDhweCAxMHB4O1xuICAgIGJhY2tncm91bmQ6ICNmOWZhZmI7XG4gICAgYm9yZGVyOiBub25lO1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICBmb250LXNpemU6IDEycHg7XG4gICAgY29sb3I6ICMzNzQxNTE7XG4gICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgfVxuICAucHJldmlldy1oZWFkZXI6aG92ZXIge1xuICAgIGJhY2tncm91bmQ6ICNmM2Y0ZjY7XG4gIH1cblxuICAucHJldmlldy1pY29uIHtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gIH1cblxuICAucHJldmlldy1sYWJlbCB7XG4gICAgZm9udC13ZWlnaHQ6IDUwMDtcbiAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICB9XG5cbiAgLnR5cGUtYmFkZ2VzIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGdhcDogM3B4O1xuICAgIGZsZXg6IDE7XG4gICAganVzdGlmeS1jb250ZW50OiBmbGV4LWVuZDtcbiAgICBmbGV4LXdyYXA6IHdyYXA7XG4gIH1cblxuICAuYmFkZ2Uge1xuICAgIGZvbnQtc2l6ZTogOXB4O1xuICAgIHBhZGRpbmc6IDFweCA1cHg7XG4gICAgYm9yZGVyLXJhZGl1czogM3B4O1xuICAgIGZvbnQtd2VpZ2h0OiA1MDA7XG4gIH1cblxuICAuY2hldnJvbiB7XG4gICAgZm9udC1zaXplOiAxMHB4O1xuICAgIGNvbG9yOiAjOWNhM2FmO1xuICAgIHRyYW5zaXRpb246IHRyYW5zZm9ybSAwLjE1cztcbiAgICBmbGV4LXNocmluazogMDtcbiAgfVxuICAuY2hldnJvbi5vcGVuIHtcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSg5MGRlZyk7XG4gIH1cblxuICAubG9ncy1saXN0IHtcbiAgICBtYXgtaGVpZ2h0OiAyNTBweDtcbiAgICBvdmVyZmxvdy15OiBhdXRvO1xuICAgIGJhY2tncm91bmQ6ICNmZmY7XG4gICAgcGFkZGluZzogNHB4O1xuICB9XG5cbiAgLmxvZy1lbnRyeSB7XG4gICAgcGFkZGluZzogNHB4IDhweDtcbiAgICBib3JkZXItbGVmdDogM3B4IHNvbGlkICNkMWQ1ZGI7XG4gICAgbWFyZ2luLWJvdHRvbTogMnB4O1xuICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICBmb250LWZhbWlseTogJ1NGIE1vbm8nLCAnTWVubG8nLCAnTW9uYWNvJywgJ0NvbnNvbGFzJywgbW9ub3NwYWNlO1xuICB9XG5cbiAgLmxvZy1oZWFkZXIge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICAgIG1hcmdpbi1ib3R0b206IDFweDtcbiAgfVxuXG4gIC5sb2ctdHlwZSB7XG4gICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlO1xuICAgIGZvbnQtc2l6ZTogOXB4O1xuICAgIGxldHRlci1zcGFjaW5nOiAwLjVweDtcbiAgfVxuXG4gIC5sb2ctdGltZSB7XG4gICAgY29sb3I6ICM5Y2EzYWY7XG4gICAgZm9udC1zaXplOiAxMHB4O1xuICB9XG5cbiAgLmxvZy1tZXNzYWdlIHtcbiAgICBjb2xvcjogIzM3NDE1MTtcbiAgICB3b3JkLWJyZWFrOiBicmVhay13b3JkO1xuICAgIHdoaXRlLXNwYWNlOiBwcmUtd3JhcDtcbiAgfVxuXG4gIC5sb2ctc291cmNlIHtcbiAgICBjb2xvcjogIzljYTNhZjtcbiAgICBmb250LXNpemU6IDEwcHg7XG4gICAgbWFyZ2luLXRvcDogMXB4O1xuICB9XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiIiLCJpZ25vcmVMaXN0IjpbXX0= */"
};
function ConsoleLogPreview($$anchor, $$props) {
  check_target(new.target);
  push($$props, true, ConsoleLogPreview);
  append_styles($$anchor, $$css$2);
  let expanded = tag(state(false), "expanded");
  const typeColors = {
    error: { bg: "#fef2f2", text: "#dc2626" },
    warn: { bg: "#fffbeb", text: "#d97706" },
    log: { bg: "#f9fafb", text: "#374151" },
    info: { bg: "#eff6ff", text: "#2563eb" },
    debug: { bg: "#f5f3ff", text: "#7c3aed" },
    trace: { bg: "#f0fdf4", text: "#16a34a" }
  };
  function getColor(type) {
    return typeColors[type] || typeColors.log;
  }
  function typeCounts(entries) {
    const counts = {};
    for (const e of entries) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return counts;
  }
  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "";
    }
  }
  var $$exports = { ...legacy_api() };
  var div = root$2();
  var button = child(div);
  button.__click = () => {
    set(expanded, !get(expanded));
  };
  var span = sibling(child(button), 2);
  var text2 = child(span);
  var div_1 = sibling(span, 2);
  add_svelte_meta(
    () => each(div_1, 21, () => Object.entries(typeCounts($$props.logs)), index, ($$anchor2, $$item) => {
      var $$array = user_derived(() => to_array(get($$item), 2));
      let type = () => get($$array)[0];
      type();
      let count = () => get($$array)[1];
      count();
      var span_1 = root_1$2();
      var text_1 = child(span_1);
      reset(span_1);
      template_effect(
        ($0, $1) => {
          set_style(span_1, `background: ${$0 ?? ""}; color: ${$1 ?? ""}`);
          set_text(text_1, `${count() ?? ""} ${type() ?? ""}`);
        },
        [() => getColor(type()).bg, () => getColor(type()).text]
      );
      append($$anchor2, span_1);
    }),
    "each",
    ConsoleLogPreview,
    48,
    6
  );
  var span_2 = sibling(div_1, 2);
  let classes;
  var node = sibling(button, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var div_2 = root_2$1();
      add_svelte_meta(
        () => each(div_2, 21, () => $$props.logs, index, ($$anchor3, entry) => {
          var div_3 = root_3$1();
          var div_4 = child(div_3);
          var span_3 = child(div_4);
          var text_2 = child(span_3, true);
          reset(span_3);
          var span_4 = sibling(span_3, 2);
          var text_3 = child(span_4, true);
          reset(span_4);
          reset(div_4);
          var div_5 = sibling(div_4, 2);
          var text_4 = child(div_5);
          reset(div_5);
          var node_1 = sibling(div_5, 2);
          {
            var consequent = ($$anchor4) => {
              var div_6 = root_4();
              var text_5 = child(div_6);
              reset(div_6);
              template_effect(() => set_text(text_5, `${get(entry).fileName ?? ""}${get(entry).lineNumber ? `:${get(entry).lineNumber}` : ""}`));
              append($$anchor4, div_6);
            };
            add_svelte_meta(
              () => if_block(node_1, ($$render) => {
                if (get(entry).fileName) $$render(consequent);
              }),
              "if",
              ConsoleLogPreview,
              66,
              10
            );
          }
          reset(div_3);
          template_effect(
            ($0, $1, $2, $3) => {
              set_style(div_3, `border-left-color: ${$0 ?? ""}`);
              set_style(span_3, `color: ${$1 ?? ""}`);
              set_text(text_2, get(entry).type);
              set_text(text_3, $2);
              set_text(text_4, `${$3 ?? ""}${get(entry).message.length > 200 ? "..." : ""}`);
            },
            [
              () => getColor(get(entry).type).text,
              () => getColor(get(entry).type).text,
              () => formatTime(get(entry).timestamp),
              () => get(entry).message.slice(0, 200)
            ]
          );
          append($$anchor3, div_3);
        }),
        "each",
        ConsoleLogPreview,
        59,
        6
      );
      append($$anchor2, div_2);
    };
    add_svelte_meta(
      () => if_block(node, ($$render) => {
        if (get(expanded)) $$render(consequent_1);
      }),
      "if",
      ConsoleLogPreview,
      57,
      2
    );
  }
  template_effect(() => {
    set_text(text2, `Console Logs (${$$props.logs.length ?? ""})`);
    classes = set_class(span_2, 1, "chevron svelte-1mjkfxc", null, classes, { open: get(expanded) });
  });
  append($$anchor, div);
  return pop($$exports);
}
delegate(["click"]);
let capturedData = tag_proxy(
  proxy({
    screenshots: [],
    consoleLogs: [],
    networkRequests: [],
    selectedElements: []
  }),
  "capturedData"
);
async function loadCapturedData() {
  try {
    const response = (await track_reactivity_loss(chrome.runtime.sendMessage({ type: "GET_ALL_CAPTURED_DATA" })))();
    if (response?.success && response.data) {
      capturedData.screenshots = response.data.screenshots || [];
      capturedData.consoleLogs = response.data.consoleLogs || [];
      capturedData.networkRequests = response.data.networkRequests || [];
      capturedData.selectedElements = response.data.selectedElements || [];
    }
  } catch (err) {
    console.error(...log_if_contains_state("error", "Failed to load captured data:", err));
  }
}
async function clearAllData() {
  try {
    (await track_reactivity_loss(chrome.runtime.sendMessage({ type: "CLEAR_CAPTURED_DATA" })))();
    capturedData.screenshots = [];
    capturedData.consoleLogs = [];
    capturedData.networkRequests = [];
    capturedData.selectedElements = [];
  } catch (err) {
    console.error(...log_if_contains_state("error", "Failed to clear data:", err));
  }
}
CaptureActions[FILENAME] = "src/popup/components/CaptureActions.svelte";
var root_1$1 = add_locations(from_html(`<div> </div>`), CaptureActions[FILENAME], [[161, 4]]);
var root$1 = add_locations(from_html(`<section class="actions svelte-1dw3jt8"><div class="action-group svelte-1dw3jt8"><span class="group-label svelte-1dw3jt8">Screenshot</span> <div class="action-grid svelte-1dw3jt8"><button class="action-btn primary svelte-1dw3jt8"><span class="icon svelte-1dw3jt8">&#x1f4f8;</span> Visible Area</button> <button class="action-btn primary svelte-1dw3jt8"><span class="icon svelte-1dw3jt8">&#x1f4dc;</span> Full Page</button> <button class="action-btn svelte-1dw3jt8"><span class="icon svelte-1dw3jt8">&#x1f3af;</span> Element</button> <button class="action-btn svelte-1dw3jt8"><span class="icon svelte-1dw3jt8">&#x270f;&#xfe0f;</span> Annotate</button></div></div> <div class="action-group svelte-1dw3jt8"><span class="group-label svelte-1dw3jt8">Capture Data</span> <div class="action-grid svelte-1dw3jt8"><button class="action-btn svelte-1dw3jt8"><span class="icon svelte-1dw3jt8">&#x1f41b;</span> Console Logs</button> <button class="action-btn svelte-1dw3jt8"><span class="icon svelte-1dw3jt8">&#x1f310;</span> Network Logs</button></div></div> <!></section>`), CaptureActions[FILENAME], [
  [
    129,
    0,
    [
      [
        130,
        2,
        [
          [131, 4],
          [
            132,
            4,
            [
              [133, 6, [[134, 8]]],
              [136, 6, [[137, 8]]],
              [139, 6, [[140, 8]]],
              [142, 6, [[143, 8]]]
            ]
          ]
        ]
      ],
      [
        148,
        2,
        [
          [149, 4],
          [150, 4, [[151, 6, [[152, 8]]], [154, 6, [[155, 8]]]]]
        ]
      ]
    ]
  ]
]);
const $$css$1 = {
  hash: "svelte-1dw3jt8",
  code: "\n  .actions.svelte-1dw3jt8 {\n    margin-bottom: 12px;\n  }\n\n  .action-group.svelte-1dw3jt8 {\n    margin-bottom: 10px;\n  }\n\n  .group-label.svelte-1dw3jt8 {\n    display: block;\n    font-weight: 600;\n    font-size: 13px;\n    color: #374151;\n    margin-bottom: 6px;\n  }\n\n  .action-grid.svelte-1dw3jt8 {\n    display: grid;\n    grid-template-columns: 1fr 1fr;\n    gap: 6px;\n  }\n\n  .action-btn.svelte-1dw3jt8 {\n    padding: 9px 6px;\n    border: 1px solid #d1d5db;\n    border-radius: 6px;\n    background: #f9fafb;\n    color: #374151;\n    font-size: 12px;\n    text-align: center;\n    cursor: pointer;\n    transition: all 0.15s;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 4px;\n  }\n  .action-btn.svelte-1dw3jt8:hover {\n    background: #f3f4f6;\n    border-color: #9ca3af;\n  }\n  .action-btn.primary.svelte-1dw3jt8 {\n    background: #3b82f6;\n    border-color: #3b82f6;\n    color: white;\n  }\n  .action-btn.primary.svelte-1dw3jt8:hover {\n    background: #2563eb;\n    border-color: #2563eb;\n  }\n\n  .icon.svelte-1dw3jt8 {\n    font-size: 13px;\n  }\n\n  .status.svelte-1dw3jt8 {\n    margin-top: 8px;\n    padding: 6px 10px;\n    background: #f0f9ff;\n    border: 1px solid #bae6fd;\n    border-radius: 4px;\n    font-size: 12px;\n    color: #0369a1;\n  }\n  .status.error.svelte-1dw3jt8 {\n    background: #fef2f2;\n    border-color: #fecaca;\n    color: #dc2626;\n  }\n\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ2FwdHVyZUFjdGlvbnMuc3ZlbHRlIiwic291cmNlcyI6WyJDYXB0dXJlQWN0aW9ucy5zdmVsdGUiXSwic291cmNlc0NvbnRlbnQiOlsiPHNjcmlwdCBsYW5nPVwidHNcIj5cbiAgaW1wb3J0IHsgbG9hZENhcHR1cmVkRGF0YSB9IGZyb20gJy4uL3N0b3Jlcy9jYXB0dXJlZERhdGEuc3ZlbHRlJ1xuXG4gIGxldCBzdGF0dXM6IHsgbWVzc2FnZTogc3RyaW5nOyBpc0Vycm9yOiBib29sZWFuIH0gfCBudWxsID0gJHN0YXRlKG51bGwpXG5cbiAgYXN5bmMgZnVuY3Rpb24gZ2V0Q3VycmVudFRhYigpOiBQcm9taXNlPGNocm9tZS50YWJzLlRhYj4ge1xuICAgIGNvbnN0IFt0YWJdID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSlcbiAgICByZXR1cm4gdGFiXG4gIH1cblxuICBmdW5jdGlvbiBzaG93U3RhdHVzKG1lc3NhZ2U6IHN0cmluZywgaXNFcnJvciA9IGZhbHNlKSB7XG4gICAgc3RhdHVzID0geyBtZXNzYWdlLCBpc0Vycm9yIH1cbiAgICBzZXRUaW1lb3V0KCgpID0+IHsgc3RhdHVzID0gbnVsbCB9LCAzMDAwKVxuICB9XG5cbiAgZnVuY3Rpb24gZm9ybWF0Qnl0ZXMoYnl0ZXM6IG51bWJlcik6IHN0cmluZyB7XG4gICAgaWYgKGJ5dGVzIDwgMTAyNCkgcmV0dXJuIGAke2J5dGVzfSBCYFxuICAgIGlmIChieXRlcyA8IDEwMjQgKiAxMDI0KSByZXR1cm4gYCR7KGJ5dGVzIC8gMTAyNCkudG9GaXhlZCgxKX0gS0JgXG4gICAgcmV0dXJuIGAkeyhieXRlcyAvICgxMDI0ICogMTAyNCkpLnRvRml4ZWQoMSl9IE1CYFxuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gY2FwdHVyZVZpc2libGUoKSB7XG4gICAgdHJ5IHtcbiAgICAgIHNob3dTdGF0dXMoJ0NhcHR1cmluZyB2aXNpYmxlIGFyZWEuLi4nKVxuICAgICAgY29uc3QgdGFiID0gYXdhaXQgZ2V0Q3VycmVudFRhYigpXG4gICAgICBpZiAoIXRhYi5pZCkgdGhyb3cgbmV3IEVycm9yKCdObyBhY3RpdmUgdGFiJylcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiLmlkLCB7XG4gICAgICAgIHR5cGU6ICdDQVBUVVJFX1NDUkVFTlNIT1QnLFxuICAgICAgICBvcHRpb25zOiB7IHR5cGU6ICd2aXNpYmxlJyB9XG4gICAgICB9KVxuICAgICAgaWYgKHJlc3BvbnNlPy5zdWNjZXNzKSB7XG4gICAgICAgIGNvbnN0IHNpemUgPSByZXNwb25zZS5zaXplID8gYCAoJHtmb3JtYXRCeXRlcyhyZXNwb25zZS5zaXplKX0pYCA6ICcnXG4gICAgICAgIHNob3dTdGF0dXMoYFZpc2libGUgYXJlYSBjYXB0dXJlZCR7c2l6ZX0hYClcbiAgICAgICAgYXdhaXQgbG9hZENhcHR1cmVkRGF0YSgpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IocmVzcG9uc2U/LmVycm9yIHx8ICdDYXB0dXJlIGZhaWxlZCcpXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBzaG93U3RhdHVzKGBGYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gLCB0cnVlKVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGNhcHR1cmVGdWxsUGFnZSgpIHtcbiAgICB0cnkge1xuICAgICAgc2hvd1N0YXR1cygnQ2FwdHVyaW5nIGZ1bGwgcGFnZS4uLicpXG4gICAgICBjb25zdCB0YWIgPSBhd2FpdCBnZXRDdXJyZW50VGFiKClcbiAgICAgIGlmICghdGFiLmlkKSB0aHJvdyBuZXcgRXJyb3IoJ05vIGFjdGl2ZSB0YWInKVxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUudGFicy5zZW5kTWVzc2FnZSh0YWIuaWQsIHtcbiAgICAgICAgdHlwZTogJ0NBUFRVUkVfU0NSRUVOU0hPVCcsXG4gICAgICAgIG9wdGlvbnM6IHsgdHlwZTogJ2Z1bGxwYWdlJyB9XG4gICAgICB9KVxuICAgICAgaWYgKHJlc3BvbnNlPy5zdWNjZXNzKSB7XG4gICAgICAgIGNvbnN0IGRpbXMgPSByZXNwb25zZS53aWR0aCAmJiByZXNwb25zZS5oZWlnaHQgPyBgICR7cmVzcG9uc2Uud2lkdGh9eCR7cmVzcG9uc2UuaGVpZ2h0fWAgOiAnJ1xuICAgICAgICBzaG93U3RhdHVzKGBGdWxsIHBhZ2UgY2FwdHVyZWQke2RpbXN9IWApXG4gICAgICAgIGF3YWl0IGxvYWRDYXB0dXJlZERhdGEoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKHJlc3BvbnNlPy5lcnJvciB8fCAnQ2FwdHVyZSBmYWlsZWQnKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgc2hvd1N0YXR1cyhgRmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCwgdHJ1ZSlcbiAgICB9XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBjYXB0dXJlRWxlbWVudCgpIHtcbiAgICB0cnkge1xuICAgICAgc2hvd1N0YXR1cygnQ2xpY2sgYW4gZWxlbWVudCB0byBjYXB0dXJlLi4uJylcbiAgICAgIGNvbnN0IHRhYiA9IGF3YWl0IGdldEN1cnJlbnRUYWIoKVxuICAgICAgaWYgKCF0YWIuaWQpIHRocm93IG5ldyBFcnJvcignTm8gYWN0aXZlIHRhYicpXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYi5pZCwgeyB0eXBlOiAnU1RBUlRfRUxFTUVOVF9TQ1JFRU5TSE9UJyB9KVxuICAgICAgaWYgKHJlc3BvbnNlPy5zdWNjZXNzKSB7XG4gICAgICAgIHdpbmRvdy5jbG9zZSgpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IocmVzcG9uc2U/LmVycm9yIHx8ICdFbGVtZW50IHBpY2tlciBmYWlsZWQnKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgc2hvd1N0YXR1cyhgRmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCwgdHJ1ZSlcbiAgICB9XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBhbm5vdGF0ZSgpIHtcbiAgICB0cnkge1xuICAgICAgc2hvd1N0YXR1cygnT3BlbmluZyBhbm5vdGF0aW9uIGVkaXRvci4uLicpXG4gICAgICBjb25zdCB0YWIgPSBhd2FpdCBnZXRDdXJyZW50VGFiKClcbiAgICAgIGlmICghdGFiLmlkKSB0aHJvdyBuZXcgRXJyb3IoJ05vIGFjdGl2ZSB0YWInKVxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUudGFicy5zZW5kTWVzc2FnZSh0YWIuaWQsIHsgdHlwZTogJ09QRU5fQU5OT1RBVElPTl9FRElUT1InIH0pXG4gICAgICBpZiAocmVzcG9uc2U/LnN1Y2Nlc3MpIHtcbiAgICAgICAgd2luZG93LmNsb3NlKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihyZXNwb25zZT8uZXJyb3IgfHwgJ05vIHNjcmVlbnNob3QgdG8gYW5ub3RhdGUnKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgc2hvd1N0YXR1cyhgRmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCwgdHJ1ZSlcbiAgICB9XG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBjYXB0dXJlQ29uc29sZUxvZ3MoKSB7XG4gICAgdHJ5IHtcbiAgICAgIHNob3dTdGF0dXMoJ0NhcHR1cmluZyBjb25zb2xlIGxvZ3MuLi4nKVxuICAgICAgY29uc3QgdGFiID0gYXdhaXQgZ2V0Q3VycmVudFRhYigpXG4gICAgICBpZiAoIXRhYi5pZCkgdGhyb3cgbmV3IEVycm9yKCdObyBhY3RpdmUgdGFiJylcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiLmlkLCB7IHR5cGU6ICdDQVBUVVJFX0NPTlNPTEVfTE9HUycgfSlcbiAgICAgIGlmIChyZXNwb25zZT8uc3VjY2Vzcykge1xuICAgICAgICBzaG93U3RhdHVzKGBDYXB0dXJlZCAke3Jlc3BvbnNlLmxvZ3NDb3VudCB8fCAwfSBjb25zb2xlIGxvZ3MhYClcbiAgICAgICAgYXdhaXQgbG9hZENhcHR1cmVkRGF0YSgpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IocmVzcG9uc2U/LmVycm9yIHx8ICdDYXB0dXJlIGZhaWxlZCcpXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBzaG93U3RhdHVzKGBGYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gLCB0cnVlKVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGNhcHR1cmVOZXR3b3JrTG9ncygpIHtcbiAgICB0cnkge1xuICAgICAgc2hvd1N0YXR1cygnQ2FwdHVyaW5nIG5ldHdvcmsgbG9ncy4uLicpXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgdHlwZTogJ0NBUFRVUkVfTkVUV09SS19MT0dTJyB9KVxuICAgICAgaWYgKHJlc3BvbnNlPy5zdWNjZXNzKSB7XG4gICAgICAgIHNob3dTdGF0dXMoYENhcHR1cmVkICR7cmVzcG9uc2UucmVxdWVzdHNDb3VudCB8fCAwfSBuZXR3b3JrIHJlcXVlc3RzIWApXG4gICAgICAgIGF3YWl0IGxvYWRDYXB0dXJlZERhdGEoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKHJlc3BvbnNlPy5lcnJvciB8fCAnQ2FwdHVyZSBmYWlsZWQnKVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgc2hvd1N0YXR1cyhgRmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCwgdHJ1ZSlcbiAgICB9XG4gIH1cbjwvc2NyaXB0PlxuXG48c2VjdGlvbiBjbGFzcz1cImFjdGlvbnNcIj5cbiAgPGRpdiBjbGFzcz1cImFjdGlvbi1ncm91cFwiPlxuICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbGFiZWxcIj5TY3JlZW5zaG90PC9zcGFuPlxuICAgIDxkaXYgY2xhc3M9XCJhY3Rpb24tZ3JpZFwiPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImFjdGlvbi1idG4gcHJpbWFyeVwiIG9uY2xpY2s9e2NhcHR1cmVWaXNpYmxlfT5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uXCI+JiN4MWY0Zjg7PC9zcGFuPiBWaXNpYmxlIEFyZWFcbiAgICAgIDwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImFjdGlvbi1idG4gcHJpbWFyeVwiIG9uY2xpY2s9e2NhcHR1cmVGdWxsUGFnZX0+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiaWNvblwiPiYjeDFmNGRjOzwvc3Bhbj4gRnVsbCBQYWdlXG4gICAgICA8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJhY3Rpb24tYnRuXCIgb25jbGljaz17Y2FwdHVyZUVsZW1lbnR9PlxuICAgICAgICA8c3BhbiBjbGFzcz1cImljb25cIj4mI3gxZjNhZjs8L3NwYW4+IEVsZW1lbnRcbiAgICAgIDwvYnV0dG9uPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cImFjdGlvbi1idG5cIiBvbmNsaWNrPXthbm5vdGF0ZX0+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiaWNvblwiPiYjeDI3MGY7JiN4ZmUwZjs8L3NwYW4+IEFubm90YXRlXG4gICAgICA8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG5cbiAgPGRpdiBjbGFzcz1cImFjdGlvbi1ncm91cFwiPlxuICAgIDxzcGFuIGNsYXNzPVwiZ3JvdXAtbGFiZWxcIj5DYXB0dXJlIERhdGE8L3NwYW4+XG4gICAgPGRpdiBjbGFzcz1cImFjdGlvbi1ncmlkXCI+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwiYWN0aW9uLWJ0blwiIG9uY2xpY2s9e2NhcHR1cmVDb25zb2xlTG9nc30+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiaWNvblwiPiYjeDFmNDFiOzwvc3Bhbj4gQ29uc29sZSBMb2dzXG4gICAgICA8L2J1dHRvbj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJhY3Rpb24tYnRuXCIgb25jbGljaz17Y2FwdHVyZU5ldHdvcmtMb2dzfT5cbiAgICAgICAgPHNwYW4gY2xhc3M9XCJpY29uXCI+JiN4MWYzMTA7PC9zcGFuPiBOZXR3b3JrIExvZ3NcbiAgICAgIDwvYnV0dG9uPlxuICAgIDwvZGl2PlxuICA8L2Rpdj5cblxuICB7I2lmIHN0YXR1c31cbiAgICA8ZGl2IGNsYXNzPVwic3RhdHVzXCIgY2xhc3M6ZXJyb3I9e3N0YXR1cy5pc0Vycm9yfT5cbiAgICAgIHtzdGF0dXMubWVzc2FnZX1cbiAgICA8L2Rpdj5cbiAgey9pZn1cbjwvc2VjdGlvbj5cblxuPHN0eWxlPlxuICAuYWN0aW9ucyB7XG4gICAgbWFyZ2luLWJvdHRvbTogMTJweDtcbiAgfVxuXG4gIC5hY3Rpb24tZ3JvdXAge1xuICAgIG1hcmdpbi1ib3R0b206IDEwcHg7XG4gIH1cblxuICAuZ3JvdXAtbGFiZWwge1xuICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIGNvbG9yOiAjMzc0MTUxO1xuICAgIG1hcmdpbi1ib3R0b206IDZweDtcbiAgfVxuXG4gIC5hY3Rpb24tZ3JpZCB7XG4gICAgZGlzcGxheTogZ3JpZDtcbiAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmciAxZnI7XG4gICAgZ2FwOiA2cHg7XG4gIH1cblxuICAuYWN0aW9uLWJ0biB7XG4gICAgcGFkZGluZzogOXB4IDZweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiO1xuICAgIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgICBiYWNrZ3JvdW5kOiAjZjlmYWZiO1xuICAgIGNvbG9yOiAjMzc0MTUxO1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gICAgY3Vyc29yOiBwb2ludGVyO1xuICAgIHRyYW5zaXRpb246IGFsbCAwLjE1cztcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgZ2FwOiA0cHg7XG4gIH1cbiAgLmFjdGlvbi1idG46aG92ZXIge1xuICAgIGJhY2tncm91bmQ6ICNmM2Y0ZjY7XG4gICAgYm9yZGVyLWNvbG9yOiAjOWNhM2FmO1xuICB9XG4gIC5hY3Rpb24tYnRuLnByaW1hcnkge1xuICAgIGJhY2tncm91bmQ6ICMzYjgyZjY7XG4gICAgYm9yZGVyLWNvbG9yOiAjM2I4MmY2O1xuICAgIGNvbG9yOiB3aGl0ZTtcbiAgfVxuICAuYWN0aW9uLWJ0bi5wcmltYXJ5OmhvdmVyIHtcbiAgICBiYWNrZ3JvdW5kOiAjMjU2M2ViO1xuICAgIGJvcmRlci1jb2xvcjogIzI1NjNlYjtcbiAgfVxuXG4gIC5pY29uIHtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gIH1cblxuICAuc3RhdHVzIHtcbiAgICBtYXJnaW4tdG9wOiA4cHg7XG4gICAgcGFkZGluZzogNnB4IDEwcHg7XG4gICAgYmFja2dyb3VuZDogI2YwZjlmZjtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjYmFlNmZkO1xuICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICBmb250LXNpemU6IDEycHg7XG4gICAgY29sb3I6ICMwMzY5YTE7XG4gIH1cbiAgLnN0YXR1cy5lcnJvciB7XG4gICAgYmFja2dyb3VuZDogI2ZlZjJmMjtcbiAgICBib3JkZXItY29sb3I6ICNmZWNhY2E7XG4gICAgY29sb3I6ICNkYzI2MjY7XG4gIH1cbjwvc3R5bGU+XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IiIsImlnbm9yZUxpc3QiOltdfQ== */"
};
function CaptureActions($$anchor, $$props) {
  check_target(new.target);
  push($$props, true, CaptureActions);
  append_styles($$anchor, $$css$1);
  let status = tag(state(null), "status");
  async function getCurrentTab() {
    const [tab] = (await track_reactivity_loss(chrome.tabs.query({ active: true, currentWindow: true })))();
    return tab;
  }
  function showStatus(message, isError = false) {
    set(status, { message, isError }, true);
    setTimeout(
      () => {
        set(status, null);
      },
      3e3
    );
  }
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  async function captureVisible() {
    try {
      showStatus("Capturing visible area...");
      const tab = (await track_reactivity_loss(getCurrentTab()))();
      if (!tab.id) throw new Error("No active tab");
      const response = (await track_reactivity_loss(chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_SCREENSHOT", options: { type: "visible" } })))();
      if (response?.success) {
        const size = response.size ? ` (${formatBytes(response.size)})` : "";
        showStatus(`Visible area captured${size}!`);
        (await track_reactivity_loss(loadCapturedData()))();
      } else {
        throw new Error(response?.error || "Capture failed");
      }
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`, true);
    }
  }
  async function captureFullPage() {
    try {
      showStatus("Capturing full page...");
      const tab = (await track_reactivity_loss(getCurrentTab()))();
      if (!tab.id) throw new Error("No active tab");
      const response = (await track_reactivity_loss(chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_SCREENSHOT", options: { type: "fullpage" } })))();
      if (response?.success) {
        const dims = response.width && response.height ? ` ${response.width}x${response.height}` : "";
        showStatus(`Full page captured${dims}!`);
        (await track_reactivity_loss(loadCapturedData()))();
      } else {
        throw new Error(response?.error || "Capture failed");
      }
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`, true);
    }
  }
  async function captureElement() {
    try {
      showStatus("Click an element to capture...");
      const tab = (await track_reactivity_loss(getCurrentTab()))();
      if (!tab.id) throw new Error("No active tab");
      const response = (await track_reactivity_loss(chrome.tabs.sendMessage(tab.id, { type: "START_ELEMENT_SCREENSHOT" })))();
      if (response?.success) {
        window.close();
      } else {
        throw new Error(response?.error || "Element picker failed");
      }
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`, true);
    }
  }
  async function annotate() {
    try {
      showStatus("Opening annotation editor...");
      const tab = (await track_reactivity_loss(getCurrentTab()))();
      if (!tab.id) throw new Error("No active tab");
      const response = (await track_reactivity_loss(chrome.tabs.sendMessage(tab.id, { type: "OPEN_ANNOTATION_EDITOR" })))();
      if (response?.success) {
        window.close();
      } else {
        throw new Error(response?.error || "No screenshot to annotate");
      }
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`, true);
    }
  }
  async function captureConsoleLogs() {
    try {
      showStatus("Capturing console logs...");
      const tab = (await track_reactivity_loss(getCurrentTab()))();
      if (!tab.id) throw new Error("No active tab");
      const response = (await track_reactivity_loss(chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_CONSOLE_LOGS" })))();
      if (response?.success) {
        showStatus(`Captured ${response.logsCount || 0} console logs!`);
        (await track_reactivity_loss(loadCapturedData()))();
      } else {
        throw new Error(response?.error || "Capture failed");
      }
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`, true);
    }
  }
  async function captureNetworkLogs() {
    try {
      showStatus("Capturing network logs...");
      const response = (await track_reactivity_loss(chrome.runtime.sendMessage({ type: "CAPTURE_NETWORK_LOGS" })))();
      if (response?.success) {
        showStatus(`Captured ${response.requestsCount || 0} network requests!`);
        (await track_reactivity_loss(loadCapturedData()))();
      } else {
        throw new Error(response?.error || "Capture failed");
      }
    } catch (err) {
      showStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`, true);
    }
  }
  var $$exports = { ...legacy_api() };
  var section = root$1();
  var div = child(section);
  var div_1 = sibling(child(div), 2);
  var button = child(div_1);
  button.__click = captureVisible;
  var button_1 = sibling(button, 2);
  button_1.__click = captureFullPage;
  var button_2 = sibling(button_1, 2);
  button_2.__click = captureElement;
  var button_3 = sibling(button_2, 2);
  button_3.__click = annotate;
  var div_2 = sibling(div, 2);
  var div_3 = sibling(child(div_2), 2);
  var button_4 = child(div_3);
  button_4.__click = captureConsoleLogs;
  var button_5 = sibling(button_4, 2);
  button_5.__click = captureNetworkLogs;
  var node = sibling(div_2, 2);
  {
    var consequent = ($$anchor2) => {
      var div_4 = root_1$1();
      let classes;
      var text2 = child(div_4);
      template_effect(() => {
        classes = set_class(div_4, 1, "status svelte-1dw3jt8", null, classes, { error: get(status).isError });
        set_text(text2, get(status).message);
      });
      append($$anchor2, div_4);
    };
    add_svelte_meta(
      () => if_block(node, ($$render) => {
        if (get(status)) $$render(consequent);
      }),
      "if",
      CaptureActions,
      160,
      2
    );
  }
  append($$anchor, section);
  return pop($$exports);
}
delegate(["click"]);
App[FILENAME] = "src/popup/App.svelte";
var root_1 = add_locations(from_html(`<button class="back-btn svelte-2iqjbh">&larr; Back</button>`), App[FILENAME], [[37, 6]]);
var root_3 = add_locations(from_html(`<div class="captured-section svelte-2iqjbh"><div class="section-header svelte-2iqjbh"><span class="section-title svelte-2iqjbh">Captured Data</span> <button class="clear-btn svelte-2iqjbh">Clear All</button></div> <!> <!> <!></div>`), App[FILENAME], [[47, 6, [[48, 8, [[49, 10], [50, 10]]]]]]);
var root_2 = add_locations(from_html(`<!> <!> <div class="report-section svelte-2iqjbh"><button class="report-btn svelte-2iqjbh">Create Bug Report</button></div> <footer class="footer svelte-2iqjbh"><button class="settings-link svelte-2iqjbh">Settings</button></footer>`, 1), App[FILENAME], [[67, 4, [[68, 6]]], [73, 4, [[74, 6]]]]);
var root = add_locations(from_html(`<div class="popup svelte-2iqjbh"><header class="header svelte-2iqjbh"><div class="logo svelte-2iqjbh">J</div> <h1 class="title svelte-2iqjbh">JAT Bug Reporter</h1> <!></header> <!></div>`), App[FILENAME], [[32, 0, [[33, 2, [[34, 4], [35, 4]]]]]]);
const $$css = {
  hash: "svelte-2iqjbh",
  code: "\n  body {\n    width: 420px;\n    margin: 0;\n    padding: 0;\n    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n    font-size: 14px;\n    background-color: #ffffff;\n    color: #1f2937;\n  }\n\n  .popup.svelte-2iqjbh {\n    padding: 16px;\n    min-height: 200px;\n  }\n\n  .header.svelte-2iqjbh {\n    display: flex;\n    align-items: center;\n    margin-bottom: 16px;\n    padding-bottom: 12px;\n    border-bottom: 1px solid #e5e7eb;\n  }\n\n  .logo.svelte-2iqjbh {\n    width: 28px;\n    height: 28px;\n    margin-right: 10px;\n    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n    border-radius: 6px;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    color: white;\n    font-weight: 700;\n    font-size: 14px;\n    flex-shrink: 0;\n  }\n\n  .title.svelte-2iqjbh {\n    font-size: 15px;\n    font-weight: 600;\n    margin: 0;\n    flex: 1;\n  }\n\n  .back-btn.svelte-2iqjbh {\n    padding: 4px 10px;\n    border: 1px solid #d1d5db;\n    border-radius: 4px;\n    background: #f9fafb;\n    color: #374151;\n    font-size: 12px;\n    cursor: pointer;\n  }\n  .back-btn.svelte-2iqjbh:hover {\n    background: #f3f4f6;\n  }\n\n  .captured-section.svelte-2iqjbh {\n    margin-bottom: 12px;\n  }\n\n  .section-header.svelte-2iqjbh {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;\n    margin-bottom: 8px;\n  }\n\n  .section-title.svelte-2iqjbh {\n    font-weight: 600;\n    font-size: 13px;\n    color: #374151;\n  }\n\n  .clear-btn.svelte-2iqjbh {\n    padding: 2px 8px;\n    border: 1px solid #d1d5db;\n    border-radius: 4px;\n    background: #fff;\n    color: #6b7280;\n    font-size: 11px;\n    cursor: pointer;\n  }\n  .clear-btn.svelte-2iqjbh:hover {\n    background: #fef2f2;\n    border-color: #fca5a5;\n    color: #dc2626;\n  }\n\n  .report-section.svelte-2iqjbh {\n    margin-bottom: 12px;\n  }\n\n  .report-btn.svelte-2iqjbh {\n    width: 100%;\n    padding: 10px;\n    background: #3b82f6;\n    border: none;\n    border-radius: 6px;\n    color: white;\n    font-size: 14px;\n    font-weight: 600;\n    cursor: pointer;\n    transition: background 0.15s;\n  }\n  .report-btn.svelte-2iqjbh:hover {\n    background: #2563eb;\n  }\n\n  .footer.svelte-2iqjbh {\n    text-align: center;\n    padding-top: 8px;\n    border-top: 1px solid #f3f4f6;\n  }\n\n  .settings-link.svelte-2iqjbh {\n    color: #6b7280;\n    font-size: 12px;\n    background: none;\n    border: none;\n    cursor: pointer;\n    padding: 0;\n    font-family: inherit;\n  }\n  .settings-link.svelte-2iqjbh:hover {\n    color: #374151;\n    text-decoration: underline;\n  }\n\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXBwLnN2ZWx0ZSIsInNvdXJjZXMiOlsiQXBwLnN2ZWx0ZSJdLCJzb3VyY2VzQ29udGVudCI6WyI8c2NyaXB0IGxhbmc9XCJ0c1wiPlxuICBpbXBvcnQgRmVlZGJhY2tGb3JtIGZyb20gJy4vY29tcG9uZW50cy9GZWVkYmFja0Zvcm0uc3ZlbHRlJ1xuICBpbXBvcnQgU2NyZWVuc2hvdFByZXZpZXcgZnJvbSAnLi9jb21wb25lbnRzL1NjcmVlbnNob3RQcmV2aWV3LnN2ZWx0ZSdcbiAgaW1wb3J0IEVsZW1lbnRQcmV2aWV3IGZyb20gJy4vY29tcG9uZW50cy9FbGVtZW50UHJldmlldy5zdmVsdGUnXG4gIGltcG9ydCBDb25zb2xlTG9nUHJldmlldyBmcm9tICcuL2NvbXBvbmVudHMvQ29uc29sZUxvZ1ByZXZpZXcuc3ZlbHRlJ1xuICBpbXBvcnQgQ2FwdHVyZUFjdGlvbnMgZnJvbSAnLi9jb21wb25lbnRzL0NhcHR1cmVBY3Rpb25zLnN2ZWx0ZSdcbiAgaW1wb3J0IHsgY2FwdHVyZWREYXRhLCBsb2FkQ2FwdHVyZWREYXRhLCBjbGVhckFsbERhdGEgfSBmcm9tICcuL3N0b3Jlcy9jYXB0dXJlZERhdGEuc3ZlbHRlJ1xuXG4gIGxldCB2aWV3OiAnbWFpbicgfCAnZm9ybScgPSAkc3RhdGUoJ21haW4nKVxuXG4gIC8vIExvYWQgY2FwdHVyZWQgZGF0YSB3aGVuIHBvcHVwIG9wZW5zXG4gICRlZmZlY3QoKCkgPT4ge1xuICAgIGxvYWRDYXB0dXJlZERhdGEoKVxuICB9KVxuXG4gIGZ1bmN0aW9uIG9wZW5Gb3JtKCkge1xuICAgIHZpZXcgPSAnZm9ybSdcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsb3NlRm9ybSgpIHtcbiAgICB2aWV3ID0gJ2Zvcm0nXG4gICAgLy8gUmVsb2FkIGRhdGEgaW4gY2FzZSBjYXB0dXJlcyBoYXBwZW5lZFxuICAgIGxvYWRDYXB0dXJlZERhdGEoKVxuICAgIHZpZXcgPSAnbWFpbidcbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNsZWFyKCkge1xuICAgIGF3YWl0IGNsZWFyQWxsRGF0YSgpXG4gIH1cbjwvc2NyaXB0PlxuXG48ZGl2IGNsYXNzPVwicG9wdXBcIj5cbiAgPGhlYWRlciBjbGFzcz1cImhlYWRlclwiPlxuICAgIDxkaXYgY2xhc3M9XCJsb2dvXCI+SjwvZGl2PlxuICAgIDxoMSBjbGFzcz1cInRpdGxlXCI+SkFUIEJ1ZyBSZXBvcnRlcjwvaDE+XG4gICAgeyNpZiB2aWV3ID09PSAnZm9ybSd9XG4gICAgICA8YnV0dG9uIGNsYXNzPVwiYmFjay1idG5cIiBvbmNsaWNrPXsoKSA9PiB7IHZpZXcgPSAnbWFpbicgfX0+XG4gICAgICAgICZsYXJyOyBCYWNrXG4gICAgICA8L2J1dHRvbj5cbiAgICB7L2lmfVxuICA8L2hlYWRlcj5cblxuICB7I2lmIHZpZXcgPT09ICdtYWluJ31cbiAgICA8Q2FwdHVyZUFjdGlvbnMgLz5cblxuICAgIHsjaWYgY2FwdHVyZWREYXRhLnNjcmVlbnNob3RzLmxlbmd0aCA+IDAgfHwgY2FwdHVyZWREYXRhLnNlbGVjdGVkRWxlbWVudHMubGVuZ3RoID4gMCB8fCBjYXB0dXJlZERhdGEuY29uc29sZUxvZ3MubGVuZ3RoID4gMH1cbiAgICAgIDxkaXYgY2xhc3M9XCJjYXB0dXJlZC1zZWN0aW9uXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzZWN0aW9uLWhlYWRlclwiPlxuICAgICAgICAgIDxzcGFuIGNsYXNzPVwic2VjdGlvbi10aXRsZVwiPkNhcHR1cmVkIERhdGE8L3NwYW4+XG4gICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImNsZWFyLWJ0blwiIG9uY2xpY2s9e2hhbmRsZUNsZWFyfT5DbGVhciBBbGw8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgeyNpZiBjYXB0dXJlZERhdGEuc2NyZWVuc2hvdHMubGVuZ3RoID4gMH1cbiAgICAgICAgICA8U2NyZWVuc2hvdFByZXZpZXcgc2NyZWVuc2hvdHM9e2NhcHR1cmVkRGF0YS5zY3JlZW5zaG90c30gLz5cbiAgICAgICAgey9pZn1cblxuICAgICAgICB7I2lmIGNhcHR1cmVkRGF0YS5zZWxlY3RlZEVsZW1lbnRzLmxlbmd0aCA+IDB9XG4gICAgICAgICAgPEVsZW1lbnRQcmV2aWV3IGVsZW1lbnRzPXtjYXB0dXJlZERhdGEuc2VsZWN0ZWRFbGVtZW50c30gLz5cbiAgICAgICAgey9pZn1cblxuICAgICAgICB7I2lmIGNhcHR1cmVkRGF0YS5jb25zb2xlTG9ncy5sZW5ndGggPiAwfVxuICAgICAgICAgIDxDb25zb2xlTG9nUHJldmlldyBsb2dzPXtjYXB0dXJlZERhdGEuY29uc29sZUxvZ3N9IC8+XG4gICAgICAgIHsvaWZ9XG4gICAgICA8L2Rpdj5cbiAgICB7L2lmfVxuXG4gICAgPGRpdiBjbGFzcz1cInJlcG9ydC1zZWN0aW9uXCI+XG4gICAgICA8YnV0dG9uIGNsYXNzPVwicmVwb3J0LWJ0blwiIG9uY2xpY2s9e29wZW5Gb3JtfT5cbiAgICAgICAgQ3JlYXRlIEJ1ZyBSZXBvcnRcbiAgICAgIDwvYnV0dG9uPlxuICAgIDwvZGl2PlxuXG4gICAgPGZvb3RlciBjbGFzcz1cImZvb3RlclwiPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cInNldHRpbmdzLWxpbmtcIiBvbmNsaWNrPXsoKSA9PiB7IGNocm9tZS5ydW50aW1lLm9wZW5PcHRpb25zUGFnZT8uKCkgfX0+XG4gICAgICAgIFNldHRpbmdzXG4gICAgICA8L2J1dHRvbj5cbiAgICA8L2Zvb3Rlcj5cbiAgezplbHNlfVxuICAgIDxGZWVkYmFja0Zvcm1cbiAgICAgIHNjcmVlbnNob3RzPXtjYXB0dXJlZERhdGEuc2NyZWVuc2hvdHN9XG4gICAgICBjb25zb2xlTG9ncz17Y2FwdHVyZWREYXRhLmNvbnNvbGVMb2dzfVxuICAgICAgc2VsZWN0ZWRFbGVtZW50cz17Y2FwdHVyZWREYXRhLnNlbGVjdGVkRWxlbWVudHN9XG4gICAgICBvbmNsb3NlPXtjbG9zZUZvcm19XG4gICAgLz5cbiAgey9pZn1cbjwvZGl2PlxuXG48c3R5bGU+XG4gIDpnbG9iYWwoYm9keSkge1xuICAgIHdpZHRoOiA0MjBweDtcbiAgICBtYXJnaW46IDA7XG4gICAgcGFkZGluZzogMDtcbiAgICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCAnU2Vnb2UgVUknLCBSb2JvdG8sIHNhbnMtc2VyaWY7XG4gICAgZm9udC1zaXplOiAxNHB4O1xuICAgIGJhY2tncm91bmQtY29sb3I6ICNmZmZmZmY7XG4gICAgY29sb3I6ICMxZjI5Mzc7XG4gIH1cblxuICAucG9wdXAge1xuICAgIHBhZGRpbmc6IDE2cHg7XG4gICAgbWluLWhlaWdodDogMjAwcHg7XG4gIH1cblxuICAuaGVhZGVyIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgbWFyZ2luLWJvdHRvbTogMTZweDtcbiAgICBwYWRkaW5nLWJvdHRvbTogMTJweDtcbiAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2U1ZTdlYjtcbiAgfVxuXG4gIC5sb2dvIHtcbiAgICB3aWR0aDogMjhweDtcbiAgICBoZWlnaHQ6IDI4cHg7XG4gICAgbWFyZ2luLXJpZ2h0OiAxMHB4O1xuICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM2NjdlZWEgMCUsICM3NjRiYTIgMTAwJSk7XG4gICAgYm9yZGVyLXJhZGl1czogNnB4O1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICBjb2xvcjogd2hpdGU7XG4gICAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgICBmb250LXNpemU6IDE0cHg7XG4gICAgZmxleC1zaHJpbms6IDA7XG4gIH1cblxuICAudGl0bGUge1xuICAgIGZvbnQtc2l6ZTogMTVweDtcbiAgICBmb250LXdlaWdodDogNjAwO1xuICAgIG1hcmdpbjogMDtcbiAgICBmbGV4OiAxO1xuICB9XG5cbiAgLmJhY2stYnRuIHtcbiAgICBwYWRkaW5nOiA0cHggMTBweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiO1xuICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICBiYWNrZ3JvdW5kOiAjZjlmYWZiO1xuICAgIGNvbG9yOiAjMzc0MTUxO1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gIH1cbiAgLmJhY2stYnRuOmhvdmVyIHtcbiAgICBiYWNrZ3JvdW5kOiAjZjNmNGY2O1xuICB9XG5cbiAgLmNhcHR1cmVkLXNlY3Rpb24ge1xuICAgIG1hcmdpbi1ib3R0b206IDEycHg7XG4gIH1cblxuICAuc2VjdGlvbi1oZWFkZXIge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgbWFyZ2luLWJvdHRvbTogOHB4O1xuICB9XG5cbiAgLnNlY3Rpb24tdGl0bGUge1xuICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIGNvbG9yOiAjMzc0MTUxO1xuICB9XG5cbiAgLmNsZWFyLWJ0biB7XG4gICAgcGFkZGluZzogMnB4IDhweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiO1xuICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICBiYWNrZ3JvdW5kOiAjZmZmO1xuICAgIGNvbG9yOiAjNmI3MjgwO1xuICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gIH1cbiAgLmNsZWFyLWJ0bjpob3ZlciB7XG4gICAgYmFja2dyb3VuZDogI2ZlZjJmMjtcbiAgICBib3JkZXItY29sb3I6ICNmY2E1YTU7XG4gICAgY29sb3I6ICNkYzI2MjY7XG4gIH1cblxuICAucmVwb3J0LXNlY3Rpb24ge1xuICAgIG1hcmdpbi1ib3R0b206IDEycHg7XG4gIH1cblxuICAucmVwb3J0LWJ0biB7XG4gICAgd2lkdGg6IDEwMCU7XG4gICAgcGFkZGluZzogMTBweDtcbiAgICBiYWNrZ3JvdW5kOiAjM2I4MmY2O1xuICAgIGJvcmRlcjogbm9uZTtcbiAgICBib3JkZXItcmFkaXVzOiA2cHg7XG4gICAgY29sb3I6IHdoaXRlO1xuICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICBmb250LXdlaWdodDogNjAwO1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMTVzO1xuICB9XG4gIC5yZXBvcnQtYnRuOmhvdmVyIHtcbiAgICBiYWNrZ3JvdW5kOiAjMjU2M2ViO1xuICB9XG5cbiAgLmZvb3RlciB7XG4gICAgdGV4dC1hbGlnbjogY2VudGVyO1xuICAgIHBhZGRpbmctdG9wOiA4cHg7XG4gICAgYm9yZGVyLXRvcDogMXB4IHNvbGlkICNmM2Y0ZjY7XG4gIH1cblxuICAuc2V0dGluZ3MtbGluayB7XG4gICAgY29sb3I6ICM2YjcyODA7XG4gICAgZm9udC1zaXplOiAxMnB4O1xuICAgIGJhY2tncm91bmQ6IG5vbmU7XG4gICAgYm9yZGVyOiBub25lO1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICBwYWRkaW5nOiAwO1xuICAgIGZvbnQtZmFtaWx5OiBpbmhlcml0O1xuICB9XG4gIC5zZXR0aW5ncy1saW5rOmhvdmVyIHtcbiAgICBjb2xvcjogIzM3NDE1MTtcbiAgICB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTtcbiAgfVxuPC9zdHlsZT5cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiIiwiaWdub3JlTGlzdCI6W119 */"
};
function App($$anchor, $$props) {
  check_target(new.target);
  push($$props, true, App);
  append_styles($$anchor, $$css);
  let view = tag(state("main"), "view");
  user_effect(() => {
    loadCapturedData();
  });
  function openForm() {
    set(view, "form");
  }
  function closeForm() {
    set(view, "form");
    loadCapturedData();
    set(view, "main");
  }
  async function handleClear() {
    (await track_reactivity_loss(clearAllData()))();
  }
  var $$exports = { ...legacy_api() };
  var div = root();
  var header = child(div);
  var node = sibling(child(header), 4);
  {
    var consequent = ($$anchor2) => {
      var button = root_1();
      button.__click = () => {
        set(view, "main");
      };
      append($$anchor2, button);
    };
    add_svelte_meta(
      () => if_block(node, ($$render) => {
        if (strict_equals(get(view), "form")) $$render(consequent);
      }),
      "if",
      App,
      36,
      4
    );
  }
  var node_1 = sibling(header, 2);
  {
    var consequent_5 = ($$anchor2) => {
      var fragment = root_2();
      var node_2 = first_child(fragment);
      add_svelte_meta(() => CaptureActions(node_2, {}), "component", App, 44, 4, { componentTag: "CaptureActions" });
      var node_3 = sibling(node_2, 2);
      {
        var consequent_4 = ($$anchor3) => {
          var div_1 = root_3();
          var div_2 = child(div_1);
          var button_1 = sibling(child(div_2), 2);
          button_1.__click = handleClear;
          var node_4 = sibling(div_2, 2);
          {
            var consequent_1 = ($$anchor4) => {
              add_svelte_meta(
                () => ScreenshotPreview($$anchor4, {
                  get screenshots() {
                    return capturedData.screenshots;
                  }
                }),
                "component",
                App,
                54,
                10,
                { componentTag: "ScreenshotPreview" }
              );
            };
            add_svelte_meta(
              () => if_block(node_4, ($$render) => {
                if (capturedData.screenshots.length > 0) $$render(consequent_1);
              }),
              "if",
              App,
              53,
              8
            );
          }
          var node_5 = sibling(node_4, 2);
          {
            var consequent_2 = ($$anchor4) => {
              add_svelte_meta(
                () => ElementPreview($$anchor4, {
                  get elements() {
                    return capturedData.selectedElements;
                  }
                }),
                "component",
                App,
                58,
                10,
                { componentTag: "ElementPreview" }
              );
            };
            add_svelte_meta(
              () => if_block(node_5, ($$render) => {
                if (capturedData.selectedElements.length > 0) $$render(consequent_2);
              }),
              "if",
              App,
              57,
              8
            );
          }
          var node_6 = sibling(node_5, 2);
          {
            var consequent_3 = ($$anchor4) => {
              add_svelte_meta(
                () => ConsoleLogPreview($$anchor4, {
                  get logs() {
                    return capturedData.consoleLogs;
                  }
                }),
                "component",
                App,
                62,
                10,
                { componentTag: "ConsoleLogPreview" }
              );
            };
            add_svelte_meta(
              () => if_block(node_6, ($$render) => {
                if (capturedData.consoleLogs.length > 0) $$render(consequent_3);
              }),
              "if",
              App,
              61,
              8
            );
          }
          append($$anchor3, div_1);
        };
        add_svelte_meta(
          () => if_block(node_3, ($$render) => {
            if (capturedData.screenshots.length > 0 || capturedData.selectedElements.length > 0 || capturedData.consoleLogs.length > 0) $$render(consequent_4);
          }),
          "if",
          App,
          46,
          4
        );
      }
      var div_3 = sibling(node_3, 2);
      var button_2 = child(div_3);
      button_2.__click = openForm;
      var footer = sibling(div_3, 2);
      var button_3 = child(footer);
      button_3.__click = () => {
        chrome.runtime.openOptionsPage?.();
      };
      append($$anchor2, fragment);
    };
    var alternate = ($$anchor2) => {
      add_svelte_meta(
        () => FeedbackForm($$anchor2, {
          get screenshots() {
            return capturedData.screenshots;
          },
          get consoleLogs() {
            return capturedData.consoleLogs;
          },
          get selectedElements() {
            return capturedData.selectedElements;
          },
          onclose: closeForm
        }),
        "component",
        App,
        79,
        4,
        { componentTag: "FeedbackForm" }
      );
    };
    add_svelte_meta(
      () => if_block(node_1, ($$render) => {
        if (strict_equals(get(view), "main")) $$render(consequent_5);
        else $$render(alternate, false);
      }),
      "if",
      App,
      43,
      2
    );
  }
  append($$anchor, div);
  return pop($$exports);
}
delegate(["click"]);
mount(App, { target: document.getElementById("app") });
