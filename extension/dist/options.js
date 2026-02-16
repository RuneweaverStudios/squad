import { O as delegate, P as check_target, Q as push, R as append_styles, T as tag, U as state, V as user_effect, af as track_reactivity_loss, an as getSettings, X as set, ao as getDefaultUrl, ai as user_derived, Y as legacy_api, Z as comment, _ as first_child, $ as add_svelte_meta, a0 as if_block, a as get, a1 as append, a2 as pop, a5 as template_effect, aa as bind_value, ab as add_locations, ac as FILENAME, ad as from_html, a3 as sibling, ap as saveSettings, a4 as child, aq as testConnection, ar as clearSettings, ah as set_class, a6 as set_text, am as mount } from "./supabase.js";
import "./browser-compat.js";
Options[FILENAME] = "src/options/Options.svelte";
var root_1 = add_locations(from_html(`<div class="page svelte-11xnrmq"><div class="loading svelte-11xnrmq">Loading...</div></div>`), Options[FILENAME], [[86, 2, [[87, 4]]]]);
var root_3 = add_locations(from_html(`<div> </div>`), Options[FILENAME], [[116, 8]]);
var root_2 = add_locations(
  from_html(`<div class="page svelte-11xnrmq"><header class="header svelte-11xnrmq"><div class="logo svelte-11xnrmq">J</div> <h1 class="svelte-11xnrmq">JAT Extension Settings</h1></header> <section class="section svelte-11xnrmq"><h2 class="svelte-11xnrmq">JAT IDE Connection</h2> <p class="hint svelte-11xnrmq">Connect to your JAT IDE to submit bug reports directly as tasks.
        The IDE must be running for reports to be submitted.</p> <div class="field svelte-11xnrmq"><label for="url" class="svelte-11xnrmq">JAT IDE URL</label> <input id="url" type="url" placeholder="http://localhost:3333" class="svelte-11xnrmq"/> <span class="field-hint svelte-11xnrmq">Default: http://localhost:3333 (JAT IDE dev server)</span></div> <!> <div class="actions svelte-11xnrmq"><button class="btn primary svelte-11xnrmq"> </button> <button class="btn secondary svelte-11xnrmq"> </button> <button class="btn danger svelte-11xnrmq">Reset</button></div></section> <section class="section svelte-11xnrmq"><h2 class="svelte-11xnrmq">How It Works</h2> <div class="how-it-works svelte-11xnrmq"><div class="step svelte-11xnrmq"><span class="step-num svelte-11xnrmq">1</span> <span class="step-text svelte-11xnrmq">Capture screenshots, console logs, or select elements on any page</span></div> <div class="step svelte-11xnrmq"><span class="step-num svelte-11xnrmq">2</span> <span class="step-text svelte-11xnrmq">Fill out the bug report form in the extension popup</span></div> <div class="step svelte-11xnrmq"><span class="step-num svelte-11xnrmq">3</span> <span class="step-text svelte-11xnrmq">Report is sent to JAT IDE and created as a task automatically</span></div></div></section></div>`),
  Options[FILENAME],
  [
    [
      90,
      2,
      [
        [91, 4, [[92, 6], [93, 6]]],
        [
          96,
          4,
          [
            [97, 6],
            [98, 6],
            [103, 6, [[104, 8], [105, 8], [112, 8]]],
            [121, 6, [[122, 8], [125, 8], [128, 8]]]
          ]
        ],
        [
          134,
          4,
          [
            [135, 6],
            [
              136,
              6,
              [
                [137, 8, [[138, 10], [139, 10]]],
                [141, 8, [[142, 10], [143, 10]]],
                [145, 8, [[146, 10], [147, 10]]]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
);
const $$css = {
  hash: "svelte-11xnrmq",
  code: "\n  body {\n    margin: 0;\n    padding: 0;\n    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n    font-size: 14px;\n    background: #f9fafb;\n    color: #1f2937;\n  }\n\n  .page.svelte-11xnrmq {\n    max-width: 600px;\n    margin: 0 auto;\n    padding: 24px;\n  }\n\n  .loading.svelte-11xnrmq {\n    text-align: center;\n    padding: 40px;\n    color: #6b7280;\n  }\n\n  .header.svelte-11xnrmq {\n    display: flex;\n    align-items: center;\n    gap: 12px;\n    margin-bottom: 24px;\n    padding-bottom: 16px;\n    border-bottom: 1px solid #e5e7eb;\n  }\n\n  .logo.svelte-11xnrmq {\n    width: 32px;\n    height: 32px;\n    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n    border-radius: 8px;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    color: white;\n    font-weight: 700;\n    font-size: 16px;\n    flex-shrink: 0;\n  }\n\n  h1.svelte-11xnrmq {\n    margin: 0;\n    font-size: 18px;\n    font-weight: 600;\n  }\n\n  .section.svelte-11xnrmq {\n    background: white;\n    border: 1px solid #e5e7eb;\n    border-radius: 8px;\n    padding: 20px;\n    margin-bottom: 16px;\n  }\n\n  h2.svelte-11xnrmq {\n    margin: 0 0 8px 0;\n    font-size: 15px;\n    font-weight: 600;\n  }\n\n  .hint.svelte-11xnrmq {\n    color: #6b7280;\n    font-size: 13px;\n    margin: 0 0 16px 0;\n    line-height: 1.4;\n  }\n\n  .field.svelte-11xnrmq {\n    margin-bottom: 14px;\n  }\n\n  label.svelte-11xnrmq {\n    display: block;\n    font-weight: 600;\n    font-size: 13px;\n    margin-bottom: 4px;\n    color: #374151;\n  }\n\n  input.svelte-11xnrmq {\n    width: 100%;\n    padding: 8px 10px;\n    border: 1px solid #d1d5db;\n    border-radius: 6px;\n    font-size: 13px;\n    font-family: inherit;\n    color: #1f2937;\n    background: #fff;\n    box-sizing: border-box;\n    transition: border-color 0.15s;\n  }\n\n  input.svelte-11xnrmq:focus {\n    outline: none;\n    border-color: #3b82f6;\n    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);\n  }\n\n  input.svelte-11xnrmq:disabled {\n    opacity: 0.6;\n    cursor: not-allowed;\n  }\n\n  .field-hint.svelte-11xnrmq {\n    display: block;\n    font-size: 11px;\n    color: #9ca3af;\n    margin-top: 4px;\n  }\n\n  .message.svelte-11xnrmq {\n    padding: 8px 12px;\n    border-radius: 6px;\n    font-size: 13px;\n    margin-bottom: 14px;\n  }\n\n  .message.success.svelte-11xnrmq {\n    background: #f0fdf4;\n    border: 1px solid #bbf7d0;\n    color: #166534;\n  }\n\n  .message.error.svelte-11xnrmq {\n    background: #fef2f2;\n    border: 1px solid #fecaca;\n    color: #dc2626;\n  }\n\n  .message.info.svelte-11xnrmq {\n    background: #eff6ff;\n    border: 1px solid #bfdbfe;\n    color: #1d4ed8;\n  }\n\n  .actions.svelte-11xnrmq {\n    display: flex;\n    gap: 8px;\n  }\n\n  .btn.svelte-11xnrmq {\n    padding: 8px 16px;\n    border-radius: 6px;\n    font-size: 13px;\n    font-weight: 600;\n    cursor: pointer;\n    border: none;\n    transition: background 0.15s;\n  }\n\n  .btn.svelte-11xnrmq:disabled {\n    opacity: 0.5;\n    cursor: not-allowed;\n  }\n\n  .btn.primary.svelte-11xnrmq {\n    background: #3b82f6;\n    color: white;\n  }\n\n  .btn.primary.svelte-11xnrmq:hover:not(:disabled) {\n    background: #2563eb;\n  }\n\n  .btn.secondary.svelte-11xnrmq {\n    background: #f3f4f6;\n    color: #374151;\n    border: 1px solid #d1d5db;\n  }\n\n  .btn.secondary.svelte-11xnrmq:hover:not(:disabled) {\n    background: #e5e7eb;\n  }\n\n  .btn.danger.svelte-11xnrmq {\n    background: #fff;\n    color: #dc2626;\n    border: 1px solid #fecaca;\n  }\n\n  .btn.danger.svelte-11xnrmq:hover:not(:disabled) {\n    background: #fef2f2;\n  }\n\n  .how-it-works.svelte-11xnrmq {\n    display: flex;\n    flex-direction: column;\n    gap: 10px;\n  }\n\n  .step.svelte-11xnrmq {\n    display: flex;\n    align-items: center;\n    gap: 10px;\n  }\n\n  .step-num.svelte-11xnrmq {\n    width: 24px;\n    height: 24px;\n    background: #eef2ff;\n    border-radius: 50%;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    color: #4f46e5;\n    font-weight: 700;\n    font-size: 12px;\n    flex-shrink: 0;\n  }\n\n  .step-text.svelte-11xnrmq {\n    font-size: 13px;\n    color: #374151;\n    line-height: 1.4;\n  }\n\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiT3B0aW9ucy5zdmVsdGUiLCJzb3VyY2VzIjpbIk9wdGlvbnMuc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzY3JpcHQgbGFuZz1cInRzXCI+XG4gIGltcG9ydCB7IGdldFNldHRpbmdzLCBzYXZlU2V0dGluZ3MsIGNsZWFyU2V0dGluZ3MsIHRlc3RDb25uZWN0aW9uLCBnZXREZWZhdWx0VXJsLCB0eXBlIEphdFNldHRpbmdzIH0gZnJvbSAnLi4vbGliL3N1cGFiYXNlJ1xuXG4gIGxldCBqYXRVcmwgPSAkc3RhdGUoJycpXG4gIGxldCBzYXZpbmcgPSAkc3RhdGUoZmFsc2UpXG4gIGxldCB0ZXN0aW5nID0gJHN0YXRlKGZhbHNlKVxuICBsZXQgbWVzc2FnZSA9ICRzdGF0ZTx7IHR5cGU6ICdzdWNjZXNzJyB8ICdlcnJvcicgfCAnaW5mbyc7IHRleHQ6IHN0cmluZyB9IHwgbnVsbD4obnVsbClcbiAgbGV0IGxvYWRlZCA9ICRzdGF0ZShmYWxzZSlcblxuICAvLyBMb2FkIGV4aXN0aW5nIHNldHRpbmdzIG9uIG1vdW50XG4gICRlZmZlY3QoKCkgPT4ge1xuICAgIGxvYWRTZXR0aW5ncygpXG4gIH0pXG5cbiAgYXN5bmMgZnVuY3Rpb24gbG9hZFNldHRpbmdzKCkge1xuICAgIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgZ2V0U2V0dGluZ3MoKVxuICAgIGlmIChzZXR0aW5ncykge1xuICAgICAgamF0VXJsID0gc2V0dGluZ3MuamF0VXJsXG4gICAgfSBlbHNlIHtcbiAgICAgIGphdFVybCA9IGdldERlZmF1bHRVcmwoKVxuICAgIH1cbiAgICBsb2FkZWQgPSB0cnVlXG4gIH1cblxuICBhc3luYyBmdW5jdGlvbiBoYW5kbGVTYXZlKCkge1xuICAgIGlmICghamF0VXJsLnRyaW0oKSkge1xuICAgICAgbWVzc2FnZSA9IHsgdHlwZTogJ2Vycm9yJywgdGV4dDogJ0pBVCBJREUgVVJMIGlzIHJlcXVpcmVkLicgfVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gQmFzaWMgVVJMIHZhbGlkYXRpb25cbiAgICBpZiAoIWphdFVybC5zdGFydHNXaXRoKCdodHRwOi8vJykgJiYgIWphdFVybC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICBtZXNzYWdlID0geyB0eXBlOiAnZXJyb3InLCB0ZXh0OiAnVVJMIHNob3VsZCBzdGFydCB3aXRoIGh0dHA6Ly8gb3IgaHR0cHM6Ly8nIH1cbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHNhdmluZyA9IHRydWVcbiAgICBtZXNzYWdlID0gbnVsbFxuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IHNhdmVTZXR0aW5ncyh7IGphdFVybDogamF0VXJsLnRyaW0oKSB9KVxuICAgICAgbWVzc2FnZSA9IHsgdHlwZTogJ3N1Y2Nlc3MnLCB0ZXh0OiAnU2V0dGluZ3Mgc2F2ZWQuJyB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBtZXNzYWdlID0geyB0eXBlOiAnZXJyb3InLCB0ZXh0OiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogJ0ZhaWxlZCB0byBzYXZlLicgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICBzYXZpbmcgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVRlc3QoKSB7XG4gICAgaWYgKCFqYXRVcmwudHJpbSgpKSB7XG4gICAgICBtZXNzYWdlID0geyB0eXBlOiAnZXJyb3InLCB0ZXh0OiAnRW50ZXIgYSBVUkwgZmlyc3QuJyB9XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0ZXN0aW5nID0gdHJ1ZVxuICAgIG1lc3NhZ2UgPSB7IHR5cGU6ICdpbmZvJywgdGV4dDogJ1Rlc3RpbmcgY29ubmVjdGlvbi4uLicgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFNhdmUgZmlyc3Qgc28gdGVzdENvbm5lY3Rpb24gdXNlcyBjdXJyZW50IHZhbHVlXG4gICAgICBhd2FpdCBzYXZlU2V0dGluZ3MoeyBqYXRVcmw6IGphdFVybC50cmltKCkgfSlcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdENvbm5lY3Rpb24oKVxuICAgICAgaWYgKHJlc3VsdC5vaykge1xuICAgICAgICBtZXNzYWdlID0geyB0eXBlOiAnc3VjY2VzcycsIHRleHQ6ICdDb25uZWN0ZWQgdG8gSkFUIElERSBzdWNjZXNzZnVsbHkhJyB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtZXNzYWdlID0geyB0eXBlOiAnZXJyb3InLCB0ZXh0OiByZXN1bHQuZXJyb3IgfHwgJ0Nvbm5lY3Rpb24gZmFpbGVkLicgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbWVzc2FnZSA9IHsgdHlwZTogJ2Vycm9yJywgdGV4dDogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICdUZXN0IGZhaWxlZC4nIH1cbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGVzdGluZyA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ2xlYXIoKSB7XG4gICAgYXdhaXQgY2xlYXJTZXR0aW5ncygpXG4gICAgamF0VXJsID0gZ2V0RGVmYXVsdFVybCgpXG4gICAgbWVzc2FnZSA9IHsgdHlwZTogJ2luZm8nLCB0ZXh0OiAnU2V0dGluZ3MgcmVzZXQgdG8gZGVmYXVsdC4nIH1cbiAgfVxuXG4gIGNvbnN0IGhhc1ZhbHVlID0gJGRlcml2ZWQoamF0VXJsLnRyaW0oKS5sZW5ndGggPiAwKVxuPC9zY3JpcHQ+XG5cbnsjaWYgIWxvYWRlZH1cbiAgPGRpdiBjbGFzcz1cInBhZ2VcIj5cbiAgICA8ZGl2IGNsYXNzPVwibG9hZGluZ1wiPkxvYWRpbmcuLi48L2Rpdj5cbiAgPC9kaXY+XG57OmVsc2V9XG4gIDxkaXYgY2xhc3M9XCJwYWdlXCI+XG4gICAgPGhlYWRlciBjbGFzcz1cImhlYWRlclwiPlxuICAgICAgPGRpdiBjbGFzcz1cImxvZ29cIj5KPC9kaXY+XG4gICAgICA8aDE+SkFUIEV4dGVuc2lvbiBTZXR0aW5nczwvaDE+XG4gICAgPC9oZWFkZXI+XG5cbiAgICA8c2VjdGlvbiBjbGFzcz1cInNlY3Rpb25cIj5cbiAgICAgIDxoMj5KQVQgSURFIENvbm5lY3Rpb248L2gyPlxuICAgICAgPHAgY2xhc3M9XCJoaW50XCI+XG4gICAgICAgIENvbm5lY3QgdG8geW91ciBKQVQgSURFIHRvIHN1Ym1pdCBidWcgcmVwb3J0cyBkaXJlY3RseSBhcyB0YXNrcy5cbiAgICAgICAgVGhlIElERSBtdXN0IGJlIHJ1bm5pbmcgZm9yIHJlcG9ydHMgdG8gYmUgc3VibWl0dGVkLlxuICAgICAgPC9wPlxuXG4gICAgICA8ZGl2IGNsYXNzPVwiZmllbGRcIj5cbiAgICAgICAgPGxhYmVsIGZvcj1cInVybFwiPkpBVCBJREUgVVJMPC9sYWJlbD5cbiAgICAgICAgPGlucHV0XG4gICAgICAgICAgaWQ9XCJ1cmxcIlxuICAgICAgICAgIHR5cGU9XCJ1cmxcIlxuICAgICAgICAgIGJpbmQ6dmFsdWU9e2phdFVybH1cbiAgICAgICAgICBwbGFjZWhvbGRlcj1cImh0dHA6Ly9sb2NhbGhvc3Q6MzMzM1wiXG4gICAgICAgICAgZGlzYWJsZWQ9e3NhdmluZyB8fCB0ZXN0aW5nfVxuICAgICAgICAvPlxuICAgICAgICA8c3BhbiBjbGFzcz1cImZpZWxkLWhpbnRcIj5EZWZhdWx0OiBodHRwOi8vbG9jYWxob3N0OjMzMzMgKEpBVCBJREUgZGV2IHNlcnZlcik8L3NwYW4+XG4gICAgICA8L2Rpdj5cblxuICAgICAgeyNpZiBtZXNzYWdlfVxuICAgICAgICA8ZGl2IGNsYXNzPVwibWVzc2FnZSB7bWVzc2FnZS50eXBlfVwiPlxuICAgICAgICAgIHttZXNzYWdlLnRleHR9XG4gICAgICAgIDwvZGl2PlxuICAgICAgey9pZn1cblxuICAgICAgPGRpdiBjbGFzcz1cImFjdGlvbnNcIj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBwcmltYXJ5XCIgb25jbGljaz17aGFuZGxlU2F2ZX0gZGlzYWJsZWQ9e3NhdmluZyB8fCB0ZXN0aW5nIHx8ICFoYXNWYWx1ZX0+XG4gICAgICAgICAge3NhdmluZyA/ICdTYXZpbmcuLi4nIDogJ1NhdmUnfVxuICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBzZWNvbmRhcnlcIiBvbmNsaWNrPXtoYW5kbGVUZXN0fSBkaXNhYmxlZD17c2F2aW5nIHx8IHRlc3RpbmcgfHwgIWhhc1ZhbHVlfT5cbiAgICAgICAgICB7dGVzdGluZyA/ICdUZXN0aW5nLi4uJyA6ICdUZXN0IENvbm5lY3Rpb24nfVxuICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBkYW5nZXJcIiBvbmNsaWNrPXtoYW5kbGVDbGVhcn0gZGlzYWJsZWQ9e3NhdmluZyB8fCB0ZXN0aW5nfT5cbiAgICAgICAgICBSZXNldFxuICAgICAgICA8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvc2VjdGlvbj5cblxuICAgIDxzZWN0aW9uIGNsYXNzPVwic2VjdGlvblwiPlxuICAgICAgPGgyPkhvdyBJdCBXb3JrczwvaDI+XG4gICAgICA8ZGl2IGNsYXNzPVwiaG93LWl0LXdvcmtzXCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdGVwXCI+XG4gICAgICAgICAgPHNwYW4gY2xhc3M9XCJzdGVwLW51bVwiPjE8L3NwYW4+XG4gICAgICAgICAgPHNwYW4gY2xhc3M9XCJzdGVwLXRleHRcIj5DYXB0dXJlIHNjcmVlbnNob3RzLCBjb25zb2xlIGxvZ3MsIG9yIHNlbGVjdCBlbGVtZW50cyBvbiBhbnkgcGFnZTwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJzdGVwXCI+XG4gICAgICAgICAgPHNwYW4gY2xhc3M9XCJzdGVwLW51bVwiPjI8L3NwYW4+XG4gICAgICAgICAgPHNwYW4gY2xhc3M9XCJzdGVwLXRleHRcIj5GaWxsIG91dCB0aGUgYnVnIHJlcG9ydCBmb3JtIGluIHRoZSBleHRlbnNpb24gcG9wdXA8L3NwYW4+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwic3RlcFwiPlxuICAgICAgICAgIDxzcGFuIGNsYXNzPVwic3RlcC1udW1cIj4zPC9zcGFuPlxuICAgICAgICAgIDxzcGFuIGNsYXNzPVwic3RlcC10ZXh0XCI+UmVwb3J0IGlzIHNlbnQgdG8gSkFUIElERSBhbmQgY3JlYXRlZCBhcyBhIHRhc2sgYXV0b21hdGljYWxseTwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L3NlY3Rpb24+XG4gIDwvZGl2Plxuey9pZn1cblxuPHN0eWxlPlxuICA6Z2xvYmFsKGJvZHkpIHtcbiAgICBtYXJnaW46IDA7XG4gICAgcGFkZGluZzogMDtcbiAgICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCAnU2Vnb2UgVUknLCBSb2JvdG8sIHNhbnMtc2VyaWY7XG4gICAgZm9udC1zaXplOiAxNHB4O1xuICAgIGJhY2tncm91bmQ6ICNmOWZhZmI7XG4gICAgY29sb3I6ICMxZjI5Mzc7XG4gIH1cblxuICAucGFnZSB7XG4gICAgbWF4LXdpZHRoOiA2MDBweDtcbiAgICBtYXJnaW46IDAgYXV0bztcbiAgICBwYWRkaW5nOiAyNHB4O1xuICB9XG5cbiAgLmxvYWRpbmcge1xuICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICBwYWRkaW5nOiA0MHB4O1xuICAgIGNvbG9yOiAjNmI3MjgwO1xuICB9XG5cbiAgLmhlYWRlciB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGdhcDogMTJweDtcbiAgICBtYXJnaW4tYm90dG9tOiAyNHB4O1xuICAgIHBhZGRpbmctYm90dG9tOiAxNnB4O1xuICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZTVlN2ViO1xuICB9XG5cbiAgLmxvZ28ge1xuICAgIHdpZHRoOiAzMnB4O1xuICAgIGhlaWdodDogMzJweDtcbiAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjY3ZWVhIDAlLCAjNzY0YmEyIDEwMCUpO1xuICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgY29sb3I6IHdoaXRlO1xuICAgIGZvbnQtd2VpZ2h0OiA3MDA7XG4gICAgZm9udC1zaXplOiAxNnB4O1xuICAgIGZsZXgtc2hyaW5rOiAwO1xuICB9XG5cbiAgaDEge1xuICAgIG1hcmdpbjogMDtcbiAgICBmb250LXNpemU6IDE4cHg7XG4gICAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgfVxuXG4gIC5zZWN0aW9uIHtcbiAgICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZTVlN2ViO1xuICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICBwYWRkaW5nOiAyMHB4O1xuICAgIG1hcmdpbi1ib3R0b206IDE2cHg7XG4gIH1cblxuICBoMiB7XG4gICAgbWFyZ2luOiAwIDAgOHB4IDA7XG4gICAgZm9udC1zaXplOiAxNXB4O1xuICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gIH1cblxuICAuaGludCB7XG4gICAgY29sb3I6ICM2YjcyODA7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIG1hcmdpbjogMCAwIDE2cHggMDtcbiAgICBsaW5lLWhlaWdodDogMS40O1xuICB9XG5cbiAgLmZpZWxkIHtcbiAgICBtYXJnaW4tYm90dG9tOiAxNHB4O1xuICB9XG5cbiAgbGFiZWwge1xuICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIGZvbnQtd2VpZ2h0OiA2MDA7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIG1hcmdpbi1ib3R0b206IDRweDtcbiAgICBjb2xvcjogIzM3NDE1MTtcbiAgfVxuXG4gIGlucHV0IHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBwYWRkaW5nOiA4cHggMTBweDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjZDFkNWRiO1xuICAgIGJvcmRlci1yYWRpdXM6IDZweDtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gICAgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG4gICAgY29sb3I6ICMxZjI5Mzc7XG4gICAgYmFja2dyb3VuZDogI2ZmZjtcbiAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICAgIHRyYW5zaXRpb246IGJvcmRlci1jb2xvciAwLjE1cztcbiAgfVxuXG4gIGlucHV0OmZvY3VzIHtcbiAgICBvdXRsaW5lOiBub25lO1xuICAgIGJvcmRlci1jb2xvcjogIzNiODJmNjtcbiAgICBib3gtc2hhZG93OiAwIDAgMCAycHggcmdiYSg1OSwgMTMwLCAyNDYsIDAuMTUpO1xuICB9XG5cbiAgaW5wdXQ6ZGlzYWJsZWQge1xuICAgIG9wYWNpdHk6IDAuNjtcbiAgICBjdXJzb3I6IG5vdC1hbGxvd2VkO1xuICB9XG5cbiAgLmZpZWxkLWhpbnQge1xuICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgIGZvbnQtc2l6ZTogMTFweDtcbiAgICBjb2xvcjogIzljYTNhZjtcbiAgICBtYXJnaW4tdG9wOiA0cHg7XG4gIH1cblxuICAubWVzc2FnZSB7XG4gICAgcGFkZGluZzogOHB4IDEycHg7XG4gICAgYm9yZGVyLXJhZGl1czogNnB4O1xuICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICBtYXJnaW4tYm90dG9tOiAxNHB4O1xuICB9XG5cbiAgLm1lc3NhZ2Uuc3VjY2VzcyB7XG4gICAgYmFja2dyb3VuZDogI2YwZmRmNDtcbiAgICBib3JkZXI6IDFweCBzb2xpZCAjYmJmN2QwO1xuICAgIGNvbG9yOiAjMTY2NTM0O1xuICB9XG5cbiAgLm1lc3NhZ2UuZXJyb3Ige1xuICAgIGJhY2tncm91bmQ6ICNmZWYyZjI7XG4gICAgYm9yZGVyOiAxcHggc29saWQgI2ZlY2FjYTtcbiAgICBjb2xvcjogI2RjMjYyNjtcbiAgfVxuXG4gIC5tZXNzYWdlLmluZm8ge1xuICAgIGJhY2tncm91bmQ6ICNlZmY2ZmY7XG4gICAgYm9yZGVyOiAxcHggc29saWQgI2JmZGJmZTtcbiAgICBjb2xvcjogIzFkNGVkODtcbiAgfVxuXG4gIC5hY3Rpb25zIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGdhcDogOHB4O1xuICB9XG5cbiAgLmJ0biB7XG4gICAgcGFkZGluZzogOHB4IDE2cHg7XG4gICAgYm9yZGVyLXJhZGl1czogNnB4O1xuICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICBmb250LXdlaWdodDogNjAwO1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICBib3JkZXI6IG5vbmU7XG4gICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjE1cztcbiAgfVxuXG4gIC5idG46ZGlzYWJsZWQge1xuICAgIG9wYWNpdHk6IDAuNTtcbiAgICBjdXJzb3I6IG5vdC1hbGxvd2VkO1xuICB9XG5cbiAgLmJ0bi5wcmltYXJ5IHtcbiAgICBiYWNrZ3JvdW5kOiAjM2I4MmY2O1xuICAgIGNvbG9yOiB3aGl0ZTtcbiAgfVxuXG4gIC5idG4ucHJpbWFyeTpob3Zlcjpub3QoOmRpc2FibGVkKSB7XG4gICAgYmFja2dyb3VuZDogIzI1NjNlYjtcbiAgfVxuXG4gIC5idG4uc2Vjb25kYXJ5IHtcbiAgICBiYWNrZ3JvdW5kOiAjZjNmNGY2O1xuICAgIGNvbG9yOiAjMzc0MTUxO1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNkMWQ1ZGI7XG4gIH1cblxuICAuYnRuLnNlY29uZGFyeTpob3Zlcjpub3QoOmRpc2FibGVkKSB7XG4gICAgYmFja2dyb3VuZDogI2U1ZTdlYjtcbiAgfVxuXG4gIC5idG4uZGFuZ2VyIHtcbiAgICBiYWNrZ3JvdW5kOiAjZmZmO1xuICAgIGNvbG9yOiAjZGMyNjI2O1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNmZWNhY2E7XG4gIH1cblxuICAuYnRuLmRhbmdlcjpob3Zlcjpub3QoOmRpc2FibGVkKSB7XG4gICAgYmFja2dyb3VuZDogI2ZlZjJmMjtcbiAgfVxuXG4gIC5ob3ctaXQtd29ya3Mge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICBnYXA6IDEwcHg7XG4gIH1cblxuICAuc3RlcCB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIGdhcDogMTBweDtcbiAgfVxuXG4gIC5zdGVwLW51bSB7XG4gICAgd2lkdGg6IDI0cHg7XG4gICAgaGVpZ2h0OiAyNHB4O1xuICAgIGJhY2tncm91bmQ6ICNlZWYyZmY7XG4gICAgYm9yZGVyLXJhZGl1czogNTAlO1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICBjb2xvcjogIzRmNDZlNTtcbiAgICBmb250LXdlaWdodDogNzAwO1xuICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICBmbGV4LXNocmluazogMDtcbiAgfVxuXG4gIC5zdGVwLXRleHQge1xuICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICBjb2xvcjogIzM3NDE1MTtcbiAgICBsaW5lLWhlaWdodDogMS40O1xuICB9XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiIiLCJpZ25vcmVMaXN0IjpbXX0= */"
};
function Options($$anchor, $$props) {
  check_target(new.target);
  push($$props, true, Options);
  append_styles($$anchor, $$css);
  let jatUrl = tag(state(""), "jatUrl");
  let saving = tag(state(false), "saving");
  let testing = tag(state(false), "testing");
  let message = tag(state(null), "message");
  let loaded = tag(state(false), "loaded");
  user_effect(() => {
    loadSettings();
  });
  async function loadSettings() {
    const settings = (await track_reactivity_loss(getSettings()))();
    if (settings) {
      set(jatUrl, settings.jatUrl, true);
    } else {
      set(jatUrl, getDefaultUrl(), true);
    }
    set(loaded, true);
  }
  async function handleSave() {
    if (!get(jatUrl).trim()) {
      set(message, { type: "error", text: "JAT IDE URL is required." }, true);
      return;
    }
    if (!get(jatUrl).startsWith("http://") && !get(jatUrl).startsWith("https://")) {
      set(
        message,
        {
          type: "error",
          text: "URL should start with http:// or https://"
        },
        true
      );
      return;
    }
    set(saving, true);
    set(message, null);
    try {
      (await track_reactivity_loss(saveSettings({ jatUrl: get(jatUrl).trim() })))();
      set(message, { type: "success", text: "Settings saved." }, true);
    } catch (err) {
      set(
        message,
        {
          type: "error",
          text: err instanceof Error ? err.message : "Failed to save."
        },
        true
      );
    } finally {
      set(saving, false);
    }
  }
  async function handleTest() {
    if (!get(jatUrl).trim()) {
      set(message, { type: "error", text: "Enter a URL first." }, true);
      return;
    }
    set(testing, true);
    set(message, { type: "info", text: "Testing connection..." }, true);
    try {
      (await track_reactivity_loss(saveSettings({ jatUrl: get(jatUrl).trim() })))();
      const result = (await track_reactivity_loss(testConnection()))();
      if (result.ok) {
        set(message, { type: "success", text: "Connected to JAT IDE successfully!" }, true);
      } else {
        set(message, { type: "error", text: result.error || "Connection failed." }, true);
      }
    } catch (err) {
      set(
        message,
        {
          type: "error",
          text: err instanceof Error ? err.message : "Test failed."
        },
        true
      );
    } finally {
      set(testing, false);
    }
  }
  async function handleClear() {
    (await track_reactivity_loss(clearSettings()))();
    set(jatUrl, getDefaultUrl(), true);
    set(message, { type: "info", text: "Settings reset to default." }, true);
  }
  const hasValue = tag(user_derived(() => get(jatUrl).trim().length > 0), "hasValue");
  var $$exports = { ...legacy_api() };
  var fragment = comment();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      var div = root_1();
      append($$anchor2, div);
    };
    var alternate = ($$anchor2) => {
      var div_1 = root_2();
      var section = sibling(child(div_1), 2);
      var div_2 = sibling(child(section), 4);
      var input = sibling(child(div_2), 2);
      var node_1 = sibling(div_2, 2);
      {
        var consequent_1 = ($$anchor3) => {
          var div_3 = root_3();
          var text = child(div_3);
          template_effect(() => {
            set_class(div_3, 1, `message ${get(message).type ?? ""}`, "svelte-11xnrmq");
            set_text(text, get(message).text);
          });
          append($$anchor3, div_3);
        };
        add_svelte_meta(
          () => if_block(node_1, ($$render) => {
            if (get(message)) $$render(consequent_1);
          }),
          "if",
          Options,
          115,
          6
        );
      }
      var div_4 = sibling(node_1, 2);
      var button = child(div_4);
      button.__click = handleSave;
      var text_1 = child(button);
      var button_1 = sibling(button, 2);
      button_1.__click = handleTest;
      var text_2 = child(button_1);
      var button_2 = sibling(button_1, 2);
      button_2.__click = handleClear;
      template_effect(() => {
        input.disabled = get(saving) || get(testing);
        button.disabled = get(saving) || get(testing) || !get(hasValue);
        set_text(text_1, get(saving) ? "Saving..." : "Save");
        button_1.disabled = get(saving) || get(testing) || !get(hasValue);
        set_text(text_2, get(testing) ? "Testing..." : "Test Connection");
        button_2.disabled = get(saving) || get(testing);
      });
      bind_value(
        input,
        function get$1() {
          return get(jatUrl);
        },
        function set$1($$value) {
          set(jatUrl, $$value);
        }
      );
      append($$anchor2, div_1);
    };
    add_svelte_meta(
      () => if_block(node, ($$render) => {
        if (!get(loaded)) $$render(consequent);
        else $$render(alternate, false);
      }),
      "if",
      Options,
      85,
      0
    );
  }
  append($$anchor, fragment);
  return pop($$exports);
}
delegate(["click"]);
mount(Options, {
  target: document.getElementById("app")
});
