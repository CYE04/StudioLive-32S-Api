'use strict';

const $ = id => document.getElementById(id);
let session = null, selectedMix = null, online = false, sending = false, polling = false, epoch = 0, needsCheck = false;
let currentFilter = 'all';
// Old preview flags cannot bypass real device requests.
sessionStorage.removeItem('cecp_demo_mode');
let demoMode = false; // Opt-in only, never restored across login or reload.
const demoLevels = new Map();
const cards = new Map();
let channelConfig = {};

// PreSonus UC Surface 标准色彩体系
const UC_COLORS = [
  { name: '绿色 (Verde)', value: '#22c55e', text: '#000000' },
  { name: '橙色 (Arancione)', value: '#f97316', text: '#000000' },
  { name: '紫色 (Viola)', value: '#a855f7', text: '#ffffff' },
  { name: '红色 (Rosso)', value: '#ef4444', text: '#ffffff' },
  { name: '黄色 (Giallo)', value: '#eab308', text: '#000000' },
  { name: '蓝色 (Blu)', value: '#2563eb', text: '#ffffff' },
  { name: '天蓝 (Azzurro)', value: '#0ea5e9', text: '#000000' },
  { name: '浅灰白 (Bianco)', value: '#f1f5f9', text: '#000000' },
  { name: '板岩灰 (Default)', value: '#475569', text: '#ffffff' },
  { name: '青绿 (Teal)', value: '#14b8a6', text: '#000000' },
  { name: '靛蓝 (Indigo)', value: '#6366f1', text: '#ffffff' },
  { name: '玫红 (Rose)', value: '#f43f5e', text: '#ffffff' }
];

// Original UC channel glyph geometry; see docs/uc-icons.md for provenance.
const ICONS = {
  "mic": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n<g>\n</g>\n<g>\n\t<g>\n\t\t<path d=\"M737.7,509.7c0-14.3-11.5-25.8-25.8-25.8S686,495.4,686,509.7c0,103.1-83.9,186.9-186.9,186.9    s-186.9-83.8-186.9-186.9c0-14.3-11.5-25.8-25.8-25.8s-25.8,11.5-25.8,25.8c0,122.8,93.3,224.2,212.7,237.2v61.6h-77.5    c-14.3,0-25.8,11.5-25.8,25.8s11.5,25.8,25.8,25.8h206.6c14.3,0,25.8-11.5,25.8-25.8s-11.5-25.8-25.8-25.8H525v-61.7    C644.5,733.8,737.7,632.5,737.7,509.7L737.7,509.7L737.7,509.7z\" fill=\"currentColor\" />\n\t\t<path d=\"M563.7,309.2h73.2v-28.6c0-76.1-61.6-137.7-137.7-137.7s-137.7,61.6-137.7,137.7v28.6h73.2    c9.5,0,17.2,7.7,17.2,17.2s-7.7,17.2-17.2,17.2h-73.2v34.4h73.2c9.5,0,17.2,7.7,17.2,17.2s-7.7,17.2-17.2,17.2h-73.2V447h73.2    c9.5,0,17.2,7.7,17.2,17.2s-7.7,17.2-17.2,17.2h-73.2V510c0,76.1,61.6,137.7,137.7,137.7S636.9,586.1,636.9,510v-28.6h-73.2    c-9.5,0-17.2-7.7-17.2-17.2s7.7-17.2,17.2-17.2h73.2v-34.4h-73.2c-9.5,0-17.2-7.7-17.2-17.2s7.7-17.2,17.2-17.2h73.2v-34.4h-73.2    c-9.5,0-17.2-7.7-17.2-17.2S554.2,309.2,563.7,309.2z\" fill=\"currentColor\" />\n\t</g>\n</g>\n</svg>",
  "choir": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n<g>\n</g>\n<g>\n\t<g>\n\t\t<path d=\"M256.2,491.2c34.3,0,62.5-27.5,62.5-62.5s-27.5-62.5-62.5-62.5s-62.5,27.5-62.5,62.5    C194.4,463.7,222,491.2,256.2,491.2z\" fill=\"currentColor\" />\n\t\t<path d=\"M308.3,606.6c-4.5,1.5-8.9,2.2-12.6,3c-11.9,1.5-20.9,12.7-19.4,24.6c1.5,11.2,11.2,19.4,21.6,19.4h3    c1.5,0,4.5-0.8,6.7-1.5v13.4c0,3-2.2,5.2-4.5,6l-45.4,13.4h-3.7l-45.4-13.4c-3-0.8-4.5-3-4.5-6V652c3,0.8,5.2,0.8,6.7,1.5    c11.9,1.5,23.1-6.7,24.6-19.4c1.5-11.9-6.7-23.1-19.4-24.6c-4.5-0.8-8.9-1.5-12.6-3v-20.8c0-4.5,4.5-7.4,8.2-6l41.7,12.7h3.7    l41.7-12.7c4.5-1.5,8.2,2.2,8.2,6l0.1,20.8H308.3L308.3,606.6z M354.5,569.4c-11.2-28.3-23.8-59.5-64-59.5h-67.8    c-40.2,0-52.9,32-64,59.5c-2.2,6-5.2,11.9-8.2,18.6c-5.2,11.9-4.5,23.8,1.5,34.3c6.7,12.7,20.9,20.1,33.5,24.6l-5.1,58    c0,8.2,6.7,15.7,14.9,15.7h122.1c8.9,0,15.6-7.4,14.9-15.7l-4.5-58.1c12.6-4.5,26.8-11.9,33.5-24.6c6-10.4,6-22.3,0.8-34.3    C359.7,581.3,356.7,574.6,354.5,569.4L354.5,569.4L354.5,569.4z\" fill=\"currentColor\" />\n\t\t<path d=\"M437.9,428.7c0,34.3,27.5,62.5,62.5,62.5s62.5-27.5,62.5-62.5s-27.5-62.5-62.5-62.5    C465.4,366.2,437.9,394.5,437.9,428.7z\" fill=\"currentColor\" />\n\t\t<path d=\"M552.5,606.6c-4.5,1.5-8.9,2.2-12.7,3c-11.9,1.5-20.8,12.7-19.4,24.6c1.5,11.2,11.2,19.4,21.6,19.4h3    c1.5,0,4.5-0.8,6.7-1.5v13.4c0,3-2.2,5.2-4.5,6l-45.4,13.4h-3.7l-45.4-13.4c-2.1-0.8-4.4-3-4.4-6V652c3,0.8,5.2,0.8,6.7,1.5    c11.9,1.5,23.1-6.7,24.6-19.4c1.5-11.9-6.7-23.1-19.4-24.6c-4.5-0.8-8.9-1.5-12.6-3v-20.8c0-4.5,4.5-7.4,8.2-6l41.7,12.7h3.7    l41.7-12.7c4.5-1.5,8.2,2.2,8.2,6l0,20.8H552.5z M598.7,569.4c-11.2-28.3-23.8-59.5-64-59.5h-67.8c-40.2,0-52.9,32-64,59.5    c-2.2,6-5.2,11.9-8.2,18.6c-5.2,11.9-4.5,23.8,1.5,34.3c6.7,12.7,20.9,20.1,33.5,24.6l-4.5,58.1c-0.8,8.9,6,15.7,14.9,15.7h122.1    c8.9,0,15.7-7.4,14.9-15.7l-4.5-58.1c12.7-4.5,26.8-11.9,33.5-24.6c6-10.4,6-22.3,0.8-34.3C603.2,581.3,600.9,574.6,598.7,569.4    L598.7,569.4z\" fill=\"currentColor\" />\n\t\t<path d=\"M682,428.7c0,34.3,27.5,62.5,62.5,62.5s62.5-27.5,62.5-62.5s-27.5-62.5-62.5-62.5    C710.3,366.9,682,394.5,682,428.7z\" fill=\"currentColor\" />\n\t\t<path d=\"M796.7,606.6c-4.5,1.5-8.9,2.2-12.7,3c-11.9,1.5-20.8,12.7-19.4,24.6c1.5,11.2,11.2,19.4,21.6,19.4h3    c1.5,0,4.5-0.8,6.7-1.5v13.4c0,3-2.2,5.2-4.5,6l-45.4,13.4h-3.7l-45.4-13.4c-3-0.8-4.5-3-4.5-6V652c3,0.8,5.2,0.8,6.7,1.5    c11.9,1.5,23.1-6.7,24.6-19.4c1.5-11.9-6.7-23.1-19.4-24.6c-4.5-0.8-8.9-1.5-12.7-3v-20.8c0-4.5,4.5-7.4,8.2-6l41.7,12.7h3.7    l41.7-12.7c4.5-1.5,8.2,2.2,8.2,6v20.9L796.7,606.6L796.7,606.6z M850.3,588c-3-6.7-5.2-12.7-7.4-18.6    c-11.2-28.3-23.8-59.5-64-59.5h-67.8c-40.2,0-52.9,32-64,59.5c-2.2,6-5.2,11.9-8.2,18.6c-5.2,11.9-4.5,23.8,1.5,34.3    c6.7,12.7,20.8,20.1,33.5,24.6l-4.5,58.1c-0.8,8.9,6,15.7,14.9,15.7l121.4,0c8.9,0,15.7-7.4,14.9-15.7l-4.5-58.1    c12.7-4.5,26.8-11.9,33.5-24.6C855.5,611.8,855.5,599.2,850.3,588L850.3,588L850.3,588z\" fill=\"currentColor\" />\n\t</g>\n</g>\n</svg>",
  "guitar": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\"><g><path d=\"M483.4,691.6c.3-21.3,5.5-34.7,33.3-42.3,11-3,56.3-19.4,62.9-58.1,1.6-9.1,1.7-17.4,.8-25.2-49.8,30.3-94-17-56.9-54.2l14.3-15,195.8-203.6,1.6-1.6c5.7-4.7,17.1-10.9,24-5.9,2.7-3.9,7-9.4,12.1-15.4l3.9,3.9c-1.6,2.9-1.2,6.6,1.3,9.1s6.1,3.1,10-.9,3.9-7,.9-10-6.2-2.9-9.1-1.3l-4.1-4.1c3.5-3.9,7.3-8,11.3-12.1l4.6,4.6c-1.6,2.9-1.2,6.6,1.3,9.1s6.1,3.1,10-.9,3.9-7,.9-10-6.2-2.9-9.1-1.3l-4.6-4.6c3.9-3.9,8-7.6,12.1-11.1,0,0,0,0,.1,0l4,4c-1.6,2.9-1.2,6.6,1.3,9.1,3,3,6.1,3.1,10-.9s3.9-7,.9-10-6.2-2.9-9.1-1.3l-3.7-3.7c5.5-4.4,11.1-8.3,16.4-11.1-7.1-3.4-5.7-20.3-14-23.5-1.9-.5-5-.5-7,0,.4-2,0-4.7,.2-6.7-3.3-8.8-21-7.2-23.4-14-2.8,5.3-6.7,10.9-11.1,16.4l-3.7-3.7h0c1.6-2.9,1.2-6.6-1.3-9.1s-6.1-3.1-10,.9c-3.9,3.9-3.9,7-.9,10s6.2,2.9,9.1,1.3l4,4c-3.5,4.2-7.3,8.3-11.2,12.2l-4.6-4.6s0,0,0,0c1.6-2.9,1.2-6.7-1.3-9.1-3-3-6.1-3.1-10,.9-3.9,3.9-3.9,7-.9,10s6.2,2.9,9.1,1.3l4.6,4.6c-4.1,4-8.2,7.8-12.1,11.3l-4.1-4.1h0c1.6-2.9,1.2-6.6-1.3-9.1-3-3-6.1-3.1-10,.9-3.9,3.9-3.9,7-.9,10,2.5,2.5,6.2,2.9,9.1,1.3l3.9,3.9c-6,5.2-11.4,9.4-15.4,12.1,5,6.9-1.2,18.3-5.9,24l-1.6,1.6-203.6,195.8h0c-26.6-26.8-52.4-49.1-94.3-41.8-38.7,6.6-55.1,51.9-58.1,62.9-7.6,27.8-21,33-42.3,33.3-55.6,.7-93.8,17.5-117.1,40.8-36.8,36.8-70.6,127.2,13.9,219.6,.4,.9,.9,1.8,1.6,2.7-1.8,1.9-.5,3.3-.1,4.5l-3.3,3.3c-.1,0-.2,0-.4,0l-1.7-1.7c-.4-.4-1.1-.4-1.5,0l-1.6,1.6c-.4,.4-.4,1.1,0,1.5l9.9,9.9c.4,.4,1.1,.4,1.5,0l1.6-1.6c.4-.4,.4-1.1,0-1.5l-1.7-1.7c0-.1,0-.2,0-.3l3.3-3.3c1.3,.3,2.7,1.5,4.5-.1,.9,.6,1.8,1.1,2.6,1.5,0,0,.2,.2,.3,.3,92.3,84.2,182.6,50.4,219.4,13.6,23.3-23.3,40.2-61.6,40.8-117.1Zm-71.4-100.7c-14.6-14.6-14.6-38.2,0-52.7,14.6-14.6,38.2-14.6,52.7,0,14.6,14.6,14.6,38.2,0,52.7-14.6,14.6-38.2,14.6-52.7,0Z\" fill=\"currentColor\" /></g></svg>",
  "electric-guitar": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\"><g /><g><g><path d=\"M845.04,176.3c-8.87-5.05-22.2,2-22.2,2l-.03,.03-1.23-2.81s5.16-2.38,2.05-8.39c-3.11-6.01-9.21-2.31-9.21-2.31,0,0-7.42,3.73-4.26,9.5,3.16,6.21,8.42,3.03,8.42,3.03l1.55,2.41-16.32,8.7-1.12-2.73s5.17-2.34,2.05-8.33c-3.04-5.95-9.24-2.35-9.24-2.35,0,0-7.38,3.74-4.2,9.56,3.12,6.17,8.42,3.03,8.42,3.03l1.39,2.25-16.29,8.69-1.03-2.61s5.18-2.34,2.08-8.36c-3.12-5.92-9.24-2.34-9.24-2.34,0,0-7.45,3.75-4.23,9.52,3.12,6.24,8.42,3.09,8.42,3.09l1.34,2.13-16.51,8.77-1.08-2.7s5.17-2.4,2.08-8.36c-3.09-5.95-9.27-2.31-9.27-2.31,0,0-7.34,3.77-4.2,9.56,3.19,6.1,8.46,2.98,8.46,2.98l1.32,2.25-16.75,8.93,.52-.29-1.07-2.67s5.09-2.45,2.05-8.33c-3.07-5.98-9.22-2.36-9.22-2.36,0,0-7.42,3.72-4.25,9.48,3.12,6.23,8.45,3.06,8.45,3.06l1.41,2.23-17.75,9.46,1.33-.74-1.03-2.66s5.18-2.36,2.07-8.31c-3.11-5.95-9.29-2.36-9.29-2.36,0,0-7.37,3.72-4.16,9.51,3.09,6.2,8.37,3.02,8.37,3.02l1.38,2.21-9.44,5.03s-6.42,3.04-6.03,7.89c.29,3.4,.28,7.6,.44,8.79,.5,4.74-5.04,9.73-5.04,9.73l-258.97,247.86-5.02,4.78s-14.05,8.51-26.76-4.85c-19.65-21.84-6.46-44.49-2.5-49.7,1.86-2.51,4.23-6.83,14.48-14.71,9.62-7.4,10.32-19.23,3.07-24.47-12.79-8.94-35.16,.42-35.16,.42,0,0-34.57,11.83-69.07,83.82-20.41,42.55-47.71,50.54-47.71,50.54l-76.66,32.34s-75.01,32.32-65.55,100.65c6.39,46.41,59.91,97.36,59.91,97.36l5.07,5.35s41.13,41.13,60.75,51.86c65.26,33.46,107.45-15.01,122.68-38.24,13.25-22.6,25.79-52.31,37.36-82.63,11.14-29.46,38.81-37.87,38.81-37.87,0,0,35.18-13.14,53.04-28.96,17.38-15.93,20.39-32.44,20.39-32.44,0,0,3.14-9.84-4.62-16.59-9.11-8.04-21.75,3.24-21.75,3.24,0,0-27.53,26.08-52.68-.6-15.09-16-9.57-28.49-9.57-28.49l35.96-36.58,255.43-259.47s14.79-14.37,35.62-8.77c6.55,.89,8.79-4.17,8.79-4.17l32.39-47.16s4.14-7.16,11.06-4.61c23.34,8.56,32.47-12.02,32.47-12.02,0,0,10.81-20.84-11.2-31.46Z\" fill=\"currentColor\" /></g></g></svg>",
  "bass": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n<g>\n</g>\n<g>\n\t<g>\n\t\t<path d=\"M857.5,164.2c-8.2-6.9-17.6-7.9-27.5-3.6c-0.3,0.1-2.8,1.7-6.7,4.2c-0.3-0.5-0.6-0.9-0.5-1    c1-1.6,0.2-2.9-0.3-4.3c-0.1-0.6-0.2-1.2-0.3-1.9c0-0.2,0-0.4,0-0.7c0.1-1.7,0.6-3.3,1.6-4.7c2.2-3.3,2.8-6.7,0.7-10.1    c-2.2-3.6-5.8-4.4-9.9-4.1c-1.3,0.1-2.7,0.1-4-0.2c-5.7-1.4-9.8,1.2-11.1,6.9c-0.4,1.6-1,3.1-1.8,4.6c-1.8,3.1-2.4,6.3-0.4,9.3    c2,3,4.8,4.8,8.8,3.9c3-0.6,5.7,0.2,8.1,2.1c1.2,1,2.1,2.8,4.2,1.9c0.3,0.3,0.5,0.6,0.7,1c-7,4.5-16.8,10.9-27.6,17.9    c-0.3-0.4-0.5-0.7-0.4-0.8c1-1.6,0.2-2.9-0.3-4.3c-0.1-0.6-0.2-1.2-0.3-1.9c0-0.2,0-0.4,0-0.7c0.1-1.7,0.6-3.3,1.6-4.6    c2.2-3.3,2.8-6.7,0.7-10.1c-2.2-3.6-5.8-4.4-9.9-4.1c-1.3,0.1-2.7,0.1-4-0.2c-5.7-1.4-9.8,1.2-11.1,6.9c-0.4,1.6-1,3.1-1.8,4.6    c-1.8,3.1-2.4,6.3-0.4,9.3c2,3,4.8,4.8,8.8,3.9c3-0.6,5.7,0.2,8.1,2.1c1.2,1,2.1,2.8,4.2,1.9c0.1,0,0.3,0.4,0.6,0.8    c-9,5.9-18.5,12.1-27.6,18c-0.2-0.3-0.4-0.6-0.3-0.7c1-1.6,0.2-2.9-0.3-4.3c-0.1-0.6-0.2-1.2-0.2-1.9c0-0.2,0-0.4,0-0.7    c0.1-1.7,0.6-3.3,1.6-4.7c2.2-3.3,2.8-6.7,0.7-10.1c-2.2-3.6-5.9-4.4-9.9-4.1c-1.3,0.1-2.7,0.1-4-0.2c-5.7-1.4-9.8,1.2-11.1,6.9    c-0.4,1.6-1,3.1-1.8,4.6c-1.8,3.1-2.4,6.3-0.4,9.3c2,3,4.8,4.8,8.8,3.9c3-0.6,5.7,0.2,8.1,2.1c1.2,1,2.1,2.8,4.2,1.9    c0.1,0,0.3,0.3,0.5,0.7c-10.5,6.9-20.2,13.2-27.6,18c-0.2-0.3-0.4-0.6-0.3-0.7c1-1.6,0.2-2.9-0.3-4.3c-0.1-0.6-0.2-1.2-0.3-1.9    c0-0.2,0-0.4,0-0.7c0.1-1.7,0.6-3.3,1.6-4.7c2.2-3.3,2.8-6.7,0.7-10.1c-2.2-3.6-5.8-4.4-9.9-4.1c-1.3,0.1-2.7,0.1-4-0.2    c-5.7-1.4-9.8,1.2-11.1,6.9c-0.4,1.6-1,3.1-1.8,4.6c-1.8,3.1-2.4,6.3-0.4,9.3c2,3,4.8,4.8,8.8,3.9c3-0.6,5.7,0.2,8.1,2.1    c1.2,1,2.1,2.8,4.2,1.9c0.1,0,0.2,0.3,0.5,0.6c-5.4,3.6-8.9,5.9-9.4,6.2c-6.2,4.3-7.6,9.4-4.8,16.3c0.9,2.1,1.9,4.2,2.8,6.4    c2.8,7.1,2,11.2-3.5,16.5l-5.3,5.1c-15.7,15.1-36,34.6-51.6,49.7c-23.9,23-47.7,45.9-71.6,68.9c-13.2,12.7-26.4,25.4-39.6,38.1    c-21.1,20.3-42.2,40.5-63.3,60.8l-12.2,11.8l-49.4,47.6c0,0-0.8,0.2-1.1,0.3l-0.4,0.1c-5.1,1.5-10.3,0-14.1-3.8l-0.1-0.1    c-1.8-1.9-3.3-4.1-4.2-6.5c-1-2.4-1.4-5-1.4-7.7l0-0.4c0.1-3.5,0.8-6.9,2.1-10.2l0.1-0.3c3.4-9.3,8.6-16.8,15-24.5l1.1-1.3    c10.2-11.7,13.8-20.9,13.8-20.9c5.3-11.2-5.5-18.3-5.5-18.3c-4.5-2.9-9.8-4.1-15-3.6l-0.3,0.1c-7,0.6-13.8,2.8-19.9,6.2l-0.4,0.2    c-10.3,5.7-19.7,12.9-28,21.2l-0.2,0.1c-14.8,14.7-26.9,31.9-35.8,50.8l-0.2,0.4c-3.9,8.2-8,15.8-12.6,23.7l-0.2,0.4    c-9.4,16-22.4,29.4-38.1,39.3l-0.3,0.2c-7.8,4.9-16.2,8.7-25,11.3l-0.2,0.1c-12.8,3.7-32.8,10.2-57.7,24.3l-0.3,0.1    c-18.8,10.5-33.6,26.8-42.2,46.5l-0.1,0.3c-4.4,9.8-6.6,20.5-6.4,31.2s2.5,21.3,7,31l0.1,0.2c7.9,17,18.7,32.6,32,45.8l38.5,38.5    c11.8,11.8,25.4,21.7,40.2,29.2l0.1,0c12.2,6.3,25.9,9.1,39.6,8.2s26.9-5.5,38.2-13.4l0.1-0.1c14.6-10.2,26.7-23.5,35.5-38.9    l0.1-0.1c7.5-13.1,13.8-26.9,18.8-41.2l0.1-0.2l8.9-25.3l0-0.1c1.4-4,3-7.9,4.9-11.8l0-0.1c3.7-7.8,9.9-14.1,17.5-18.1l0.1-0.1    c3.6-1.9,7.3-3.5,11.2-4.7l0.2,0c15.5-4.9,29.8-12.7,42.3-23l0.2-0.1c7.8-6.4,14.5-14.2,19.7-22.9l0.1-0.1    c4.1-6.7,5.5-14.7,3.9-22.4l0-0.2c-0.4-1.9-1.1-3.7-2.2-5.3c-1.1-1.6-2.5-3-4.1-4.1c-1.6-1.1-3.4-1.8-5.3-2.2s-3.9-0.4-5.8,0    c-0.8,0.1-1.6,0.3-2.4,0.7l-0.1,0c-2.8,1.1-5.3,2.5-7.7,4.3l-0.2,0.2c-4.2,3.3-8.8,6-13.8,8.1l-0.3,0.1c-3.1,1.4-6.4,2.3-9.8,2.8    h-0.1c-4.4,0.7-8.9,0.1-12.9-1.7l-0.2-0.1c-5.2-2.3-9.9-5.7-13.7-10l-0.2-0.2c-2.5-2.8-2.9-7.1-2.4-10.2s3.5-6.2,4.5-7.3    c0,0,28-29.2,28.4-29.6l48.2-50.3l7.1-7.4c28.3-29.3,56.5-58.7,84.8-88c21-21.8,42.1-43.6,63.1-65.4    c25.9-26.8,51.7-53.6,77.5-80.5l6.9-7.2c2.2-2.2,4.5-4.3,6.9-6.3c9.1-7.5,18.9-8.4,29.1-3c3.2,1.7,3.4,1.7,5.9-0.9    c9.2-9.9,17.6-20.4,24-32.4c5.3-9.9,10.7-19.7,16.5-29.3c3.5-5.8,8.9-8.9,15.9-8.5c1.9,0.1,3.8,0.1,5.8,0    c13.5-0.6,24-11.9,26-23.2C869,179.5,865.4,170.8,857.5,164.2L857.5,164.2z\" fill=\"currentColor\" />\n\t</g>\n</g>\n</svg>",
  "keyboard": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n<g>\n</g>\n<g>\n\t<g>\n\t\t<path d=\"M252.9,142.3h-44.8c-37.1,0-67.2,30.1-67.2,67.2v582.1c0,37.1,30.1,67.2,67.2,67.2h89.6V522.9h-22.4    c-12.4,0-22.4-11.8-22.4-26.3L252.9,142.3L252.9,142.3z\" fill=\"currentColor\" />\n\t\t<path d=\"M342.5,522.9h22.4c12.4,0,22.4-11.8,22.4-26.3V142.3H432v354.2c0,14.5,10,26.3,22.4,26.3h22.4v335.8H342.5    L342.5,522.9L342.5,522.9z\" fill=\"currentColor\" />\n\t\t<path d=\"M521.5,522.9v335.8h134.3V522.9h-22.4c-12.4,0-22.4-11.8-22.4-26.3V142.3h-44.8v354.2    c0,14.5-10,26.3-22.4,26.3L521.5,522.9L521.5,522.9z\" fill=\"currentColor\" />\n\t\t<path d=\"M745.4,142.3v354.2c0,14.5-10,26.3-22.4,26.3h-22.4v335.8h89.5c37.1,0,67.2-30,67.2-67.2V209.5    c0-37.1-30-67.2-67.2-67.2H745.4L745.4,142.3z\" fill=\"currentColor\" />\n\t</g>\n</g>\n</svg>",
  "piano": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n<g>\n</g>\n<g>\n\t<g>\n\t\t<path d=\"M585.5,639.8l12.4,180l11.7,3.3l11.7-3.7l12.4-194.6l-24.1,7.4L585.5,639.8L585.5,639.8z M249.9,721.4    l12.1,3.5l12.5-3.6l12.4-134.4l-49.4-14L249.9,721.4L249.9,721.4z M546.5,540.6l-310.7-86.2c-6.9-1.9-7.9-11.6-1.1-13.6l12-3.6    c7.4-2.2,15.1-2.2,22.5-0.1l318.4,88.5l15-4.3c16.5-4.8,28.1-13.7,32.3-27.8l-329-95.2c-6.3-1.8-9.7-7.5-9.7-14v-22.2    c0-9.7,8.4-16.7,17.7-14l324.8,93.5c2.7-16.3,13.4-34,28.3-38.6l92.5-28.4c40.8-12.5,85.9-33.1,83.9-63.3    c0,0-190.9-97.7-530.7-14.5l-23.4,5.5c-17.1,5.2-34.1,21-34.1,38.8v32.8c0,21.7-9,40.8-29.8,46.8l-48.6,14.2    c-21.4,6.2-36,25.8-36,48v53.6L525,642v-51.9C525,571.9,531.1,551,546.5,540.6L546.5,540.6L546.5,540.6z M801.6,572.6L814,721.6    l12.4,3.6l12.4-3.8L851,539C841.8,553.1,823.7,563.7,801.6,572.6L801.6,572.6L801.6,572.6z M765.2,385.7l-87.4,26.4    c-17,5.2-30.1,21-30.1,38.8v32.8c0,21.7-14.3,40.8-35.1,46.8l-46,14.2c-21.4,6.2-33.3,25.8-33.3,48v51.9l235.2-71    c42.4-12.8,75.4-28.6,91.8-64.7V320.1C843.8,359.2,807.8,372.6,765.2,385.7L765.2,385.7L765.2,385.7z\" fill=\"currentColor\" />\n\t</g>\n</g>\n</svg>",
  "drums": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n<g>\n</g>\n<g>\n\t<g>\n\t\t<path d=\"M735.9,509.3c-3.2,0-5.8,2.6-5.8,5.8v5.8h-5.8V463h5.8c3.2,0,5.8-2.6,5.8-5.8s-2.6-5.8-5.8-5.8H568.2    c-3.2,0-5.8,2.6-5.8,5.8s2.6,5.8,5.8,5.8h5.8v27.7c14.4,11.8,26.9,25.9,36.8,41.7h119.3c0,6.4-5.2,11.6-11.6,11.6h-101    c2,3.8,3.8,7.6,5.6,11.6h14.5v142.3l-20.2,8.4c-3.1,5.8-6.4,11.3-10.1,16.7l31.1-12.9c1.7,4.3,5.8,7.5,10.8,7.5s9.1-3.1,10.8-7.5    l44.9,18.6c-2.1,2.3-2,5.8,0.2,8l1.4,1.4c1.1,1.1,2.5,1.7,4.1,1.7l17.5,0c5.3,0,7.8-6.5,3.9-10l-10.5-9.8c-2.2-2-5.4-2-7.6-0.1    l-53-22V555.6h57.8c12.7,0,23.1-10.4,23.1-23.1v-17.3C741.7,511.9,739.1,509.3,735.9,509.3L735.9,509.3z\" fill=\"currentColor\" />\n\t\t<path d=\"M169.2,723.3v-81h122.3c-0.6-5.7-0.9-11.5-0.9-17.3c0-45.5,17.6-86.9,46.3-117.9v-49.8h5.8    c3.2,0,5.8-2.6,5.8-5.8s-2.6-5.8-5.8-5.8H146.1c-3.2,0-5.8,2.6-5.8,5.8s2.6,5.8,5.8,5.8h5.8v173.5h-5.8c-3.2,0-5.8,2.6-5.8,5.8    s2.6,5.8,5.8,5.8h11.6v81c-3.2,0-5.8,2.6-5.8,5.8v23.1c0,3.2,2.6,5.8,5.8,5.8h11.6c3.2,0,5.8-2.6,5.8-5.8v-23.1    C175,725.9,172.4,723.3,169.2,723.3L169.2,723.3z\" fill=\"currentColor\" />\n\t\t<path d=\"M880.5,317.8c0-10.2-82.1-21.9-82.1-21.9c-3-6.5-11.9-11.5-23.1-12.6v-22.7c0-3.2-2.6-5.8-5.8-5.8    s-5.8,2.6-5.8,5.8v23c-10.1,1.5-18.1,6.2-20.9,12.2c0,0-82.1,11.7-82.1,21.9H880.5z M748.6,623.6L671.2,677v11.6h6.1    c3.6,0,7.2-0.7,10.5-2l70.9-27.7h21.6l44.9,18.6c-2.1,2.3-2,5.8,0.2,8l1.4,1.4c1.1,1.1,2.5,1.7,4.1,1.7l17.5,0    c5.3,0,7.8-6.5,3.9-10l-10.5-9.8c-2.2-2-5.4-2-7.6-0.1l-53-22V363.5c8.4-2,14.9-6.3,17.3-11.6c0,0,82.1-11.7,82.1-21.9H660.8    c0,10.2,82.1,21.9,82.1,21.9c2.2,4.8,7.8,8.8,15.1,11v285.2L688.5,677l60.2-41.3L748.6,623.6L748.6,623.6z\" fill=\"currentColor\" />\n\t\t<path d=\"M423.7,353.2c3.2,0,5.8-2.6,5.8-5.8s-2.6-5.8-5.8-5.8H273.3c-3.2,0-5.8,2.6-5.8,5.8s2.6,5.8,5.8,5.8v63.6    c-3.2,0-5.8,2.6-5.8,5.8s2.6,5.8,5.8,5.8h150.4c3.2,0,5.8-2.6,5.8-5.8s-2.6-5.8-5.8-5.8V353.2z\" fill=\"currentColor\" />\n\t\t<path d=\"M504.6,416.8c-3.2,0-5.8,2.6-5.8,5.8s2.6,5.8,5.8,5.8h127.2c3.2,0,5.8-2.6,5.8-5.8s-2.6-5.8-5.8-5.8v-63.6    c3.2,0,5.8-2.6,5.8-5.8s-2.6-5.8-5.8-5.8H504.6c-3.2,0-5.8,2.6-5.8,5.8s2.6,5.8,5.8,5.8L504.6,416.8L504.6,416.8z\" fill=\"currentColor\" />\n\t\t<path d=\"M493,376.3h-17.4c0-6.4-5.2-11.6-11.6-11.6s-11.6,5.2-11.6,11.6h-17.4v11.6h17.4v64c3.8-0.2,7.7-0.4,11.6-0.4    s7.7,0.1,11.6,0.4v-64H493V376.3z\" fill=\"currentColor\" />\n\t\t<g>\n\t\t\t\n\t\t\t\t<rect x=\"586.3\" y=\"723.1\" transform=\"matrix(0.7071 -0.7071 0.7071 0.7071 -359.5967 639.475)\" width=\"11.6\" height=\"61.5\" fill=\"currentColor\" />\n\t\t\t<path d=\"M628.6,786.8l-17.5,0c-1.5,0-3-0.6-4.1-1.7l-1.4-1.4c-2.3-2.3-2.3-5.9,0-8.2l8.3-8.3c2.2-2.2,5.7-2.3,8-0.2     l10.5,9.8C636.4,780.4,633.9,786.9,628.6,786.8z\" fill=\"currentColor\" />\n\t\t\t\n\t\t\t\t<rect x=\"305.4\" y=\"748\" transform=\"matrix(0.7071 -0.7071 0.7071 0.7071 -434.5667 458.4894)\" width=\"61.5\" height=\"11.6\" fill=\"currentColor\" />\n\t\t\t<path d=\"M299.7,786.8l17.5,0c1.5,0,3-0.6,4.1-1.7l1.4-1.4c2.3-2.3,2.3-5.9,0-8.2l-8.3-8.3c-2.2-2.2-5.7-2.3-8-0.2     l-10.5,9.8C291.9,780.4,294.4,786.9,299.7,786.8z\" fill=\"currentColor\" />\n\t\t\t<path d=\"M464.1,463c-89.4,0-161.9,72.5-161.9,161.9s72.5,161.9,161.9,161.9S626.1,714.4,626.1,625     S553.6,463,464.1,463L464.1,463z M464.1,758c-24,0-43.4-19.4-43.4-43.4s19.4-43.4,43.4-43.4s43.4,19.4,43.4,43.4     S488.1,758,464.1,758z\" fill=\"currentColor\" />\n\t\t</g>\n\t</g>\n</g>\n</svg>",
  "music": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n<g>\n</g>\n<g>\n\t<g>\n\t\t<path d=\"M544.1,311c38.3,38.3,35,103.5-7.3,145.9c-42.4,42.4-94.5,32.6-132.9-5.7s-48.1-90.5-5.7-132.9    C440.6,276,505.8,272.7,544.1,311L544.1,311z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\" />\n\t\t<path d=\"M370.5,484.7c5.7,5.7,5.7,13.9,0,19.6l-31,31c-4.9,4.9-13.9,5.7-19.6,0s-4.9-14.7,0-19.6l31-31    C356.6,479,364.8,479,370.5,484.7z M443,492L190.3,717c-22-12.2-39.9-30.2-52.2-52.2l224.2-253.5C382.7,448,406.3,471.6,443,492    L443,492L443,492z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\" />\n\t\t<path d=\"M818.5,331.1c38.3,38.3,35,103.5-7.3,145.9c-42.4,42.4-94.5,32.6-132.9-5.7s-48.1-90.5-5.7-132.9    C715,296.1,780.2,292.8,818.5,331.1L818.5,331.1z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\" />\n\t\t<path d=\"M644.9,504.8c5.7,5.7,5.7,13.9,0,19.6l-31,31c-4.9,4.9-13.9,5.7-19.6,0s-4.9-14.7,0-19.6l31-31    C631,499.1,639.2,499.1,644.9,504.8L644.9,504.8z M717.4,512.1l-252.7,225c-22-12.2-39.9-30.2-52.2-52.2l224.2-253.5    C657.1,468.1,680.7,491.7,717.4,512.1L717.4,512.1L717.4,512.1z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\" />\n\t</g>\n</g>\n</svg>",
  "mixer": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\"><g /><g><g><path d=\"M691.04,484.58c-35.37,0-64.14-28.64-64.14-64.14s28.76-64.14,64.14-64.14,64.14,28.76,64.14,64.14-28.64,64.14-64.14,64.14Zm38.99,239.74c0,21.58-17.38,39.27-39.11,39.27s-38.96-17.68-38.96-39.27v-226.74c11.69,6.15,25.02,9.44,39.11,9.44s27.27-3.29,38.96-9.28v226.59Zm-229.48-79.3c-35.37,0-64.14-28.64-64.14-64.14s28.76-64.14,64.14-64.14,64.14,28.76,64.14,64.14-28.61,64.14-64.14,64.14Zm39.02,79.3c0,21.58-17.38,39.27-39.11,39.27s-38.96-17.68-38.96-39.27v-66.24c11.69,6,25.02,9.44,39.11,9.44s27.27-3.29,38.96-9.44v66.24Zm-229.51-160.9c-35.37,0-64.14-28.64-64.14-64.14s28.76-64.14,64.14-64.14,64.14,28.76,64.14,64.14c.03,35.49-28.61,64.14-64.14,64.14Zm39.02,160.9c0,21.58-17.38,39.27-39.11,39.27s-38.96-17.68-38.96-39.27v-147.9c11.69,6.15,25.02,9.44,39.11,9.44s27.27-3.29,38.96-9.28v147.75Zm-78.08-447.6c0-21.73,17.53-39.27,38.96-39.27,10.78,0,20.52,4.35,27.73,11.54,7.03,7.03,11.38,16.77,11.38,27.73v145.34c-11.69-6.15-25.02-9.44-38.96-9.44s-27.43,3.29-39.11,9.44v-145.34Zm190.48,0c0-21.73,17.53-39.27,38.96-39.27,10.78,0,20.52,4.35,27.73,11.54,7.03,7.03,11.38,16.77,11.38,27.73v227.02c-11.69-6.15-24.87-9.44-38.96-9.44s-27.43,3.44-39.11,9.44v-227.02Zm190.45,0c0-21.73,17.53-39.27,38.96-39.27,10.78,0,20.67,4.35,27.73,11.54,7.03,7.03,11.38,16.77,11.38,27.73v66.39c-11.69-6-24.87-9.28-38.96-9.28s-27.43,3.29-39.11,9.44v-66.54Zm106.63-135.85H242.51c-56.13,0-101.6,45.48-101.6,101.6V758.5c0,56.16,45.48,101.64,101.6,101.64H758.55c56.16,0,101.64-45.48,101.64-101.6V242.47c0-56.13-45.48-101.6-101.6-101.6Z\" fill=\"currentColor\" /></g></g></svg>",
  "player": "<svg viewBox=\"0 0 1000 1000\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n<g>\n</g>\n<g>\n\t<g>\n\t\t<path d=\"M343.6,257.4v453.3h312.4V257.4H343.6z M465.7,778.8c-7,0-11.7-4.7-11.7-11.7s4.7-11.7,11.7-11.7h68.1    c5.9,0,11.7,4.7,11.7,11.7s-5.9,11.7-11.7,11.7H465.7z M360,177.6h278.3c27,0,49.3,22.3,49.3,49.3v547.2c0,27-22.3,49.3-49.3,49.3    H360c-27,0-49.3-22.3-49.3-49.3V226.9C310.7,199.9,333,177.6,360,177.6L360,177.6z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\" />\n\t</g>\n</g>\n</svg>",
  "computer": "<svg viewBox=\"0 0 1000 1000\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" stroke-linejoin=\"round\" stroke-miterlimit=\"2\" class=\"ch-svg-icon\" aria-hidden=\"true\" focusable=\"false\" xmlns=\"http://www.w3.org/2000/svg\">\n    <g>\n        <g>\n            <path d=\"M188.3,199.9L812.2,199.9L812.2,585.1L188.3,585.1L188.3,199.9ZM527.1,636.4L527,636.2L526.9,635.9L526.8,635.5L526.7,635.4L526.3,634.4L526.2,634.3L526,634L525.9,633.7L525.6,633.1L525.4,632.6L525.4,632.5L524.8,631.3L524.7,631.2L524.4,630.8L524.4,630.7L524.1,630.3L524,630.1L523.8,629.9L522.9,628.7L522.8,628.6L522.6,628.3L522,628L521.9,627.8L519.6,625.5L519.2,625.2L518.6,624.6L517.4,623.7L517.2,623.5L516.6,623.2L516.5,623.2L516,622.9L515.2,622.5L514.9,622.3L514.8,622.2L513.8,621.8L513.7,621.7L513.4,621.6L513.1,621.4L512.9,621.3L511.9,620.9L511.8,620.8L511.4,620.7L511.2,620.6L510.4,620.4L509.9,620.2L509.8,620.2L509.3,620.1L509.1,620L508.8,619.9L508.4,619.8L508.3,619.8L507.2,619.5L507,619.5L506.6,619.4L506.3,619.3L506.1,619.3L505.6,619.2L505.5,619.2L505,619.1L504.9,619.1L504.5,619L504,619L503.5,618.9L497.6,618.9L497.1,619L496.6,619L496.2,619.1L496.1,619.1L495.6,619.2L495.5,619.2L495,619.3L494.8,619.3L494.5,619.4L494.1,619.5L493.9,619.5L492.8,619.8L492.7,619.8L492.3,619.9L492,620L491.8,620.1L491.3,620.2L491.2,620.2L490.7,620.4L489.9,620.6L489.7,620.7L489.3,620.8L489.2,620.9L488.2,621.3L488,621.4L487.7,621.6L487.4,621.7L487.3,621.8L486.3,622.2L486.2,622.3L485.9,622.5L485.1,622.9L484.6,623.2L484.5,623.2L483.9,623.5L483.7,623.7L482.5,624.6L481.9,625.2L481.5,625.5L478.8,628.2L478.6,628.5L478.5,628.6L477.6,629.8L477.4,630L477.3,630.2L477,630.6L477,630.7L476.7,631.1L476.6,631.2L476,632.4L476,632.5L475.8,633L475.5,633.6L475.4,633.9L475.2,634.2L475.1,634.3L474.7,635.3L474.6,635.4L474.5,635.8L474.4,636.1L474.3,636.3C473.1,639.5 472.4,643 472.4,646.6C472.4,662.5 485.3,675.4 501.2,675.4C517.1,675.4 530,662.5 530,646.6C530,642.9 529.3,639.5 528.1,636.3L527.1,636.3L527.1,636.4ZM172.2,151.9L828.1,151.9C845.7,151.9 860.1,166.3 860.1,183.9L860.1,676.4C860.1,694 845.7,708.4 828.1,708.4L563.9,708.4C567.2,737.3 574.2,766.2 586.1,795.2L660,795.2L660,843.2L340.4,843.2L340.4,795.2L414.3,795.2C426.2,766.3 433.3,737.4 436.5,708.4L172.3,708.4C154.7,708.4 140.3,694 140.3,676.4L140.3,183.9C140.3,166.3 154.7,151.9 172.2,151.9Z\" fill=\"currentColor\" />\n        </g>\n    </g>\n</svg>"
};

const UC_ICONS = [
  { id: 'mic', label: '话筒' },
  { id: 'choir', label: '合唱' },
  { id: 'guitar', label: '木吉他' },
  { id: 'electric-guitar', label: '电吉他' },
  { id: 'bass', label: '贝斯' },
  { id: 'keyboard', label: '键盘' },
  { id: 'piano', label: '钢琴' },
  { id: 'drums', label: '鼓组' },
  { id: 'music', label: '人声组合' },
  { id: 'mixer', label: '调音台' },
  { id: 'player', label: '播放器' },
  { id: 'computer', label: '电脑' }
];

// 亮度检测辅助函数
function isLightColor(hex) {
  if (!hex || !hex.startsWith('#')) return false;
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

// 联动通道对定义 (键盘 19-20, 鼓 21-22, 钢琴 23-24, 伴奏 25-26, 氛围 27-28, 扩展 29-30)
const LINKED_PAIR_SET = new Set([19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);

const DEFAULT_CHANNEL_CONFIG = {
  "1": {
    "name": "Coro 1",
    "color": "#808080",
    "icon": "choir",
    "textColor": "#ffffff"
  },
  "2": {
    "name": "Coro 2",
    "color": "#808080",
    "icon": "choir",
    "textColor": "#ffffff"
  },
  "3": {
    "name": "Coro 3",
    "color": "#808080",
    "icon": "choir",
    "textColor": "#ffffff"
  },
  "4": {
    "name": "Coro 4",
    "color": "#808080",
    "icon": "choir",
    "textColor": "#ffffff"
  },
  "5": {
    "name": "S:Verde",
    "color": "#22c55e",
    "icon": "mic",
    "textColor": "#000000"
  },
  "6": {
    "name": "S:Arancione",
    "color": "#f97316",
    "icon": "mic",
    "textColor": "#000000"
  },
  "7": {
    "name": "S:Viola",
    "color": "#a855f7",
    "icon": "mic",
    "textColor": "#ffffff"
  },
  "8": {
    "name": "S:Rosso",
    "color": "#ef4444",
    "icon": "mic",
    "textColor": "#ffffff"
  },
  "9": {
    "name": "S:Giallo",
    "color": "#eab308",
    "icon": "mic",
    "textColor": "#000000"
  },
  "10": {
    "name": "Blu",
    "color": "#2563eb",
    "icon": "mic",
    "textColor": "#ffffff"
  },
  "11": {
    "name": "Bianco",
    "color": "#f1f5f9",
    "icon": "mic",
    "textColor": "#000000"
  },
  "12": {
    "name": "Beige",
    "color": "#d8c4a2",
    "icon": "mic",
    "textColor": "#000000"
  },
  "13": {
    "name": "Nero",
    "color": "#252525",
    "icon": "mic",
    "textColor": "#ffffff"
  },
  "14": {
    "name": "Lavailier",
    "color": "#4f79b8",
    "icon": "mic",
    "textColor": "#ffffff"
  },
  "15": {
    "name": "MicCuffia",
    "color": "#4f79b8",
    "icon": "mic",
    "textColor": "#ffffff"
  },
  "16": {
    "name": "吉他",
    "color": "#0284c7",
    "icon": "guitar",
    "textColor": "#ffffff"
  },
  "17": {
    "name": "电吉他",
    "color": "#0ea5e9",
    "icon": "electric-guitar",
    "textColor": "#000000"
  },
  "18": {
    "name": "贝斯",
    "color": "#8166a5",
    "icon": "bass",
    "textColor": "#ffffff"
  },
  "19": {
    "name": "键盘",
    "color": "#b78335",
    "icon": "keyboard",
    "textColor": "#ffffff"
  },
  "20": {
    "name": "键盘 R",
    "color": "#b78335",
    "icon": "keyboard",
    "textColor": "#ffffff"
  },
  "21": {
    "name": "鼓",
    "color": "#a36363",
    "icon": "drums",
    "textColor": "#ffffff"
  },
  "22": {
    "name": "鼓 R",
    "color": "#a36363",
    "icon": "drums",
    "textColor": "#ffffff"
  },
  "23": {
    "name": "钢琴",
    "color": "#b78335",
    "icon": "piano",
    "textColor": "#ffffff"
  },
  "24": {
    "name": "钢琴 R",
    "color": "#b78335",
    "icon": "piano",
    "textColor": "#ffffff"
  },
  "25": {
    "name": "Mixer2",
    "color": "#367e89",
    "icon": "mixer",
    "textColor": "#ffffff"
  },
  "26": {
    "name": "Mixer2",
    "color": "#367e89",
    "icon": "mixer",
    "textColor": "#ffffff"
  },
  "27": {
    "name": "MP3",
    "color": "#4d8a72",
    "icon": "player",
    "textColor": "#ffffff"
  },
  "28": {
    "name": "MP3",
    "color": "#4d8a72",
    "icon": "player",
    "textColor": "#ffffff"
  },
  "29": {
    "name": "PCPodio",
    "color": "#64738b",
    "icon": "computer",
    "textColor": "#ffffff"
  },
  "30": {
    "name": "PCPodio",
    "color": "#64738b",
    "icon": "computer",
    "textColor": "#ffffff"
  }
};

// 获取通道定制信息（PM 聚会流程典雅配色、名称、图标、文字反色）
function getUcChannelInfo(channel, mixerName) {
  const cfg = channelConfig[String(channel)] || channelConfig[channel] || DEFAULT_CHANNEL_CONFIG[String(channel)];
  if (cfg) {
    const name = cfg.name || mixerName || `Channel ${channel}`;
    const color = cfg.color || '#4f79b8';
    const textColor = cfg.textColor || (isLightColor(color) ? '#000000' : '#ffffff');
    const icon = cfg.icon || (channel <= 15 ? 'mic' : 'music');
    const isVocal = icon === 'mic' || icon === 'choir';
    return { name, color, textColor, icon, isVocal };
  }

  // 默认规则：保留用户指定的乐器与立体声通道，采用 PM 聚会流程淡雅高级色
  if (channel === 16) return { name: '吉他', color: '#0284c7', textColor: '#ffffff', icon: 'guitar', isVocal: false };
  if (channel === 17) return { name: '电吉他', color: '#0ea5e9', textColor: '#000000', icon: 'electric-guitar', isVocal: false };
  if (channel === 18) return { name: '贝斯', color: '#8166a5', textColor: '#ffffff', icon: 'bass', isVocal: false };
  if (channel === 19 || channel === 20) return { name: '键盘', color: '#b78335', textColor: '#ffffff', icon: 'keyboard', isVocal: false };
  if (channel === 21 || channel === 22) return { name: '鼓', color: '#a36363', textColor: '#ffffff', icon: 'drums', isVocal: false };
  if (channel === 23 || channel === 24) return { name: '钢琴', color: '#b78335', textColor: '#ffffff', icon: 'piano', isVocal: false };
  if (channel === 25 || channel === 26) return { name: 'Mixer2', color: '#367e89', textColor: '#ffffff', icon: 'music', isVocal: false };
  if (channel === 27 || channel === 28) return { name: 'MP3', color: '#4d8a72', textColor: '#ffffff', icon: 'music', isVocal: false };
  if (channel === 29 || channel === 30) return { name: 'PCPodio', color: '#64738b', textColor: '#ffffff', icon: 'music', isVocal: false };

  const name = `Channel ${channel}`;
  const icon = channel <= 15 ? 'mic' : 'music';
  const color = '#4f79b8';
  const textColor = '#ffffff';
  const isVocal = channel <= 15;

  return { name, color, textColor, icon, isVocal };
}

// 本地收藏通道管理
function getStarred() {
  try { return new Set(JSON.parse(localStorage.getItem('cecp_starred_channels') || '[]')); }
  catch { return new Set(); }
}
function toggleStar(channelId) {
  const set = getStarred();
  set.has(channelId) ? set.delete(channelId) : set.add(channelId);
  try { localStorage.setItem('cecp_starred_channels', JSON.stringify([...set])); } catch {}
  updateStarIcons();
  filter();
}
function updateStarIcons() {
  const starred = getStarred();
  for (const [id, card] of cards) {
    card.starBtn.classList.toggle('starred', starred.has(id));
    card.starBtn.textContent = starred.has(id) ? '★' : '☆';
  }
}

const messages = {
  LOGIN_FAILED: '账号或密码不正确。',
  LOGIN_LIMIT: '尝试次数过多，请等待 15 分钟后再试。',
  LOGIN_REQUIRED: '登录已失效，请重新登录。',
  MIX_FORBIDDEN: '你的账号无权调节这一路混音。',
  CHANNEL_LOCKED: '该通道是你的乐器通道，已锁定不可调节。',
  UNSAFE_MIX_MODE: '该混音或通道受调音台保护，暂时只读。',
  DEVICE_BUSY: '调音台正在确认上一条调节，请稍后再试。',
  SEND_RATE_LIMIT: '调节太频繁，请稍等片刻。',
  WRITE_UNCONFIRMED: '调节结果尚未确认，电平可能已改变。请重新连接读取。',
  DISCONNECTED: '调音台连接已断开，请检查网络或点击重新连接。',
  RECONNECT_COOLDOWN: '请等待 10 秒后再尝试重新连接。',
  CSRF_FAILED: '页面已过期，请刷新后重新登录。'
};

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 17000);
  try {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { 'X-CSRF-Token': session.csrf } : {}),
        ...options.headers
      }
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && path !== '/api/login') showLogin();
      const error = new Error(messages[result.error] || result.message || '请求处理失败');
      error.code = result.error;
      throw error;
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) {
      throw new Error('网络请求未完成。若刚才正在调节，请先重新连接读取。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// 加载持久化的通道名称与外观配置
async function loadChannelConfig() {
  try {
    const res = await api('/api/channels/config');
    if (res && typeof res === 'object') {
      channelConfig = res;
    }
  } catch (e) {
    console.warn('读取通道配置失败:', e);
  }
}

function showLogin() {
  demoMode = false; demoLevels.clear();
  epoch++; session = null; selectedMix = null; cards.clear();
  if ($('channels')) $('channels').replaceChildren();
  online = false; sending = false; needsCheck = false;
  document.body.classList.add('is-login');
  if ($('loading')) $('loading').hidden = true;
  if ($('mix-panel')) $('mix-panel').hidden = true;
  if ($('login-panel')) $('login-panel').hidden = false;
  if ($('pin')) $('pin').value = '';
}

function updateDisabled() {
  const isOffline = (!online && !demoMode) || needsCheck;
  for (const card of cards.values()) {
    const disabled = isOffline || sending || !card.data.writable || Boolean(card.data.locked);
    for (const control of card.controls) {
      if (control.disabled !== disabled) {
        control.disabled = disabled;
      }
    }
  }
  $('mix-select').disabled = isOffline || sending;
  $('reconnect').disabled = sending;
}

function connection(connected) {
  online = connected;
  const available = connected || demoMode;
  if ($('offline-prompt')) $('offline-prompt').hidden = available;
  if ($('mix-body')) $('mix-body').hidden = !available;
  $('connection').textContent = demoMode ? '演示模式 · 仅预览，不控制调音台' : connected ? '● 调音台已连接 · 接收真实设备反馈' : '○ 调音台未连接 · 调节已暂停';
  $('connection').closest('.status-bar').classList.toggle('is-demo', demoMode);
  $('connection').parentElement.classList.toggle('offline', !available);
  $('toggle-demo').textContent = demoMode ? '退出演示，返回实机' : '开启演示模式';
  $('toggle-demo').classList.toggle('is-active', demoMode);
  $('toggle-demo').disabled = sending;
  $('reconnect').hidden = demoMode || (connected && !needsCheck);
  updateDisabled();
}

// StudioLive 32S / Aux 13, measured from one fresh device snapshot while the
// operator placed channels 1–11 at these physical fader marks (2026-09-26).
// These are fader-position percentages, not audio amplitude. The dB display
// between measured marks is an estimate; the API still confirms actual sends.
const DB_POINTS = [
  { db: -60, pct: 5.946 },
  { db: -50, pct: 10.270 },
  { db: -40, pct: 14.595 },
  { db: -30, pct: 25.946 },
  { db: -20, pct: 37.297 },
  { db: -10, pct: 49.189 },
  { db: -5, pct: 60.352 },
  { db: 0, pct: 73.633 },
  { db: 5, pct: 86.035 },
  { db: 10, pct: 99.902 }
];
const FADER_MARKS = [
  { db: null, label: '−∞', pct: 0 },
  ...DB_POINTS.map(point => ({ ...point, label: point.db === 0 ? 'U' :
    point.db > 0 ? `+${point.db}` : `−${Math.abs(point.db)}` }))
];

function levelToDb(pct) {
  if (pct <= 0) return '−∞ dB';
  if (pct < DB_POINTS[0].pct) return '< −60 dB';
  for (let i = 0; i < DB_POINTS.length - 1; i++) {
    const p1 = DB_POINTS[i];
    const p2 = DB_POINTS[i + 1];
    if (pct >= p1.pct && pct <= p2.pct) {
      const ratio = (pct - p1.pct) / (p2.pct - p1.pct);
      const val = p1.db + ratio * (p2.db - p1.db);
      if (Math.abs(val) < 0.05) return 'U · 0.0 dB';
      return `≈ ${val > 0 ? '+' : ''}${val.toFixed(1)} dB`;
    }
  }
  return '+10.0 dB';
}

function levelText(n) { return `${Number(n.toFixed(1))}%`; }

function updateLevelOutput(output, level) {
  if (!output) return;
  const num = Number(level);
  output.innerHTML = `<span class="level-pct">${levelText(num)}</span><span class="level-db">${levelToDb(num)}</span>`;
}

function isChannelLinked(c, allChannels) {
  if (!c) return false;
  const ch = typeof c === 'number' ? c : c.channel;
  if (LINKED_PAIR_SET.has(ch)) return true;
  if (c.linked) return true;
  if (allChannels) {
    const partner = ch % 2 === 0 ? ch - 1 : ch + 1;
    const partnerChan = allChannels.find(o => o.channel === partner);
    if (partnerChan && partnerChan.linked) return true;
  }
  return false;
}

function isSlaveChannel(c, allChannels) {
  if (c.channel % 2 === 0) {
    if (LINKED_PAIR_SET.has(c.channel)) return true;
    if (isChannelLinked(c, allChannels)) {
      const odd = allChannels.find(o => o.channel === c.channel - 1);
      if (odd && isChannelLinked(odd, allChannels)) return true;
    }
  }
  return false;
}

function isStereoMaster(c, allChannels) {
  if (c.channel % 2 !== 0) {
    if (LINKED_PAIR_SET.has(c.channel)) return true;
    if (isChannelLinked(c, allChannels)) {
      const even = allChannels.find(e => e.channel === c.channel + 1);
      if (even && isChannelLinked(even, allChannels)) return true;
    }
  }
  return false;
}

function updateCard(card, data, allChannels = []) {
  card.data = data;
  const isStereo = allChannels.length > 0 ? isStereoMaster(data, allChannels) : Boolean(card.isStereo);
  card.isStereo = isStereo;
  card.root.classList.toggle('is-stereo', isStereo);

  if (card.badge) {
    card.badge.textContent = isStereo
      ? `CH ${String(data.channel).padStart(2, '0')}/${String(data.channel + 1).padStart(2, '0')}`
      : `CH ${String(data.channel).padStart(2, '0')}`;
  }
  if (card.stereoBadge) {
    card.stereoBadge.hidden = !isStereo;
  }

  const info = getUcChannelInfo(data.channel, data.name);
  card.info = info;

  card.title.textContent = info.name;
  card.iconWrap.innerHTML = ICONS[info.icon] || ICONS['music'];
  card.root.style.setProperty('--ch-accent', info.color);
  card.root.style.setProperty('--ch-text-color', info.textColor);

  card.root.classList.toggle('readonly', !data.writable);
  card.root.classList.toggle('locked', Boolean(data.locked));
  if (!card.editing) {
    card.range.value = data.level;
    updateLevelOutput(card.output, data.level);
  }
  card.note.textContent = data.writable
    ? (demoMode ? '演示数据 · 不会发送到调音台' : isStereo ? '立体声联动 · 调音台实时反馈' : '调音台实时反馈')
    : (data.locked ? '锁定 · 自己的乐器通道不可调节' : '只读 · 调音台保护');
}

function render(channels) {
  const sorted = channels.filter(c => c.channel >= 1 && c.channel <= 30).sort((a, b) => a.channel - b.channel);
  const displayChannels = sorted.filter(c => !isSlaveChannel(c, sorted));
  const displaySet = new Set(displayChannels.map(d => d.channel));

  for (const [id, card] of cards) {
    if (!displaySet.has(id)) { card.root.remove(); cards.delete(id); }
  }
  const starred = getStarred();

  for (const data of displayChannels) {
    const isStereo = isStereoMaster(data, sorted);
    let card = cards.get(data.channel);
    if (!card) {
      const info = getUcChannelInfo(data.channel, data.name);
      const root = document.createElement('article');
      root.className = 'channel-row';
      root.style.setProperty('--ch-accent', info.color);
      root.style.setProperty('--ch-text-color', info.textColor);

      const header = document.createElement('div');
      header.className = 'channel-header';

      // 1. 收藏置顶按钮（最左侧，整齐垂直成列）
      const starBtn = document.createElement('button');
      starBtn.type = 'button';
      starBtn.className = 'star-btn' + (starred.has(data.channel) ? ' starred' : '');
      starBtn.textContent = starred.has(data.channel) ? '★' : '☆';
      starBtn.title = '收藏该通道（置顶常用）';
      starBtn.setAttribute('aria-label', `收藏通道 ${data.channel}`);
      starBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleStar(data.channel);
      });

      // 2. 序号铭牌 (如 CH 01 或立体声 CH 25/26)
      const badge = document.createElement('span');
      badge.className = 'channel-badge';
      badge.textContent = isStereo
        ? `CH ${String(data.channel).padStart(2, '0')}/${String(data.channel + 1).padStart(2, '0')}`
        : `CH ${String(data.channel).padStart(2, '0')}`;

      // 3. PM 风格轻量优雅铭牌 (浅色低饱和度微调背景)
      const namePill = document.createElement('div');
      namePill.className = 'channel-name-pill';

      const iconWrap = document.createElement('span');
      iconWrap.className = 'ch-icon-wrap';
      iconWrap.innerHTML = ICONS[info.icon] || ICONS['music'];

      const title = document.createElement('h2');
      title.className = 'channel-title';
      title.id = `channel-title-${data.channel}`;
      title.textContent = info.name;

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'edit-channel-btn';
      editBtn.innerHTML = '<svg class="edit-pen-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
      editBtn.title = isStereo ? `编辑通道 ${data.channel}/${data.channel + 1} 立体声对` : `编辑通道 ${data.channel}`;
      editBtn.setAttribute('aria-label', `编辑通道 ${data.channel}`);
      editBtn.addEventListener('click', e => {
        e.stopPropagation();
        openEditModal(data.channel);
      });

      namePill.append(iconWrap, title, editBtn);

      // 4. 立体声联动标识
      const stereoBadge = document.createElement('span');
      stereoBadge.className = 'stereo-badge';
      stereoBadge.textContent = '∞ 立体声';
      stereoBadge.hidden = !isStereo;

      // 5. 电平读数（靠最右侧）
      const output = document.createElement('output');
      output.className = 'level-value';

      header.append(starBtn, badge, namePill, stereoBadge, output);

      const controls = document.createElement('div');
      controls.className = 'fader-controls';

      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'step-btn minus';
      minus.textContent = '−1';
      minus.setAttribute('aria-label', `降低通道 ${data.channel} 发送量 1%`);

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'step-btn plus';
      plus.textContent = '+1';
      plus.setAttribute('aria-label', `提高通道 ${data.channel} 发送量 1%`);

      const trackWrap = document.createElement('div');
      trackWrap.className = 'fader-track-wrap';

      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0';
      range.max = '100';
      range.step = '0.01';
      range.setAttribute('aria-labelledby', title.id);

      const scale = document.createElement('div');
      scale.className = 'fader-scale';
      scale.setAttribute('aria-hidden', 'true');
      scale.innerHTML = FADER_MARKS.map(mark => {
        const classes = ['scale-item'];
        if (mark.db === null) classes.push('scale-inf');
        if (mark.db === -50) classes.push('scale-fifty');
        if (mark.db === 0) classes.push('scale-unity');
        if ([-40, -30].includes(mark.db)) classes.push('scale-minor');
        if ([-60, -40].includes(mark.db)) classes.push('scale-stagger');
        const title = mark.db === null ? '静音 (−∞ dB)' : mark.db === 0 ? 'U = 0 dB' : `${mark.label} dB`;
        return `<span class="${classes.join(' ')}" style="--pos: ${mark.pct}%" data-level="${mark.pct}" title="${title}"><i></i><em>${mark.label}</em></span>`;
      }).join('');

      scale.addEventListener('click', (e) => {
        const item = e.target.closest('.scale-item');
        if (!item || !card.data.writable || (!online && !demoMode) || sending || needsCheck) return;
        const posVal = Number(Number(item.dataset.level).toFixed(2));
        if (!isNaN(posVal)) {
          range.value = posVal;
          updateLevelOutput(output, posVal);
          void send(card, posVal);
        }
      });

      trackWrap.append(range, scale);

      const note = document.createElement('p');
      note.className = 'channel-note';

      controls.append(minus, trackWrap, plus);
      root.append(header, controls, note);
      $('channels').append(root);

      card = {
        root,
        badge,
        namePill,
        iconWrap,
        title,
        editBtn,
        stereoBadge,
        output,
        range,
        scale,
        note,
        starBtn,
        data,
        isStereo,
        controls: [minus, range, plus],
        editing: false,
        info
      };
      cards.set(data.channel, card);

      range.addEventListener('input', () => {
        card.editing = true;
        updateLevelOutput(output, Number(range.value));
      });
      range.addEventListener('change', () => {
        card.editing = false;
        void send(card, Number(range.value));
      });
      range.addEventListener('pointercancel', () => {
        card.editing = false;
        updateCard(card, card.data, sorted);
      });
      minus.addEventListener('click', () => void send(card, Math.max(0, Number((card.data.level - 1).toFixed(1)))));
      plus.addEventListener('click', () => void send(card, Math.min(100, Number((card.data.level + 1).toFixed(1)))));
    }
    updateCard(card, data, sorted);
  }

  // 仅在新增通道节点尚未挂载时追加，绝不重复 append 已有节点避免视口抖动
  const container = $('channels');
  const allCards = Array.from(cards.values()).sort((a, b) => a.data.channel - b.data.channel);
  for (const c of allCards) {
    if (c.root.parentElement !== container) {
      container.append(c.root);
    }
  }

  filter();
  updateDisabled();
}

function filter() {
  const query = $('search').value.trim().toLowerCase();
  const starred = getStarred();
  let visible = 0;

  for (const card of cards.values()) {
    const text = `${card.data.channel} ${card.info.name}`.toLowerCase();
    const matchesSearch = !query || text.includes(query);
    let matchesTab = true;

    if (currentFilter === 'starred') {
      matchesTab = starred.has(card.data.channel);
    } else if (currentFilter === 'vocal') {
      matchesTab = card.info.isVocal;
    } else if (currentFilter === 'instrument') {
      matchesTab = !card.info.isVocal;
    }

    const show = matchesSearch && matchesTab;
    card.root.hidden = !show;
    if (show) visible++;
  }
  $('empty').hidden = visible !== 0;
}

async function send(card, level) {
  if ((!online && !demoMode) || sending || needsCheck || !card.data.writable) {
    card.editing = false;
    updateCard(card, card.data);
    return;
  }
  if (demoMode) {
    demoLevels.set(`${selectedMix}:${card.data.channel}`, level);
    if (card.isStereo) demoLevels.set(`${selectedMix}:${card.data.channel + 1}`, level);
    updateCard(card, { ...card.data, level });
    $('notice').textContent = '演示调整：未发送任何调音台指令。';
    return;
  }
  const currentEpoch = ++epoch, mix = selectedMix;
  sending = true;
  card.root.classList.add('pending');
  updateLevelOutput(card.output, level);
  card.note.textContent = '正在确认…';
  updateDisabled();
  const savedScrollY = window.scrollY;


  try {
    const actual = await api(`/api/mixes/${mix}/channels/${card.data.channel}`, { method: 'PATCH', body: JSON.stringify({ level }) });
    if (currentEpoch === epoch) {
      updateCard(card, actual, Array.from(cards.values()).map(c => c.data));
      $('notice').textContent = `已确认: ${card.title.textContent} 为 ${levelText(actual.level)} (${levelToDb(actual.level)})`;
      if (window.scrollY === 0 && savedScrollY > 0) {
        window.scrollTo({ top: savedScrollY, behavior: 'instant' });
      }
    }
  } catch (error) {
    if (currentEpoch === epoch) {
      $('notice').textContent = error.message;
      needsCheck = true;
      connection(false);
    }
  } finally {
    if (currentEpoch === epoch) {
      sending = false;
      card.root.classList.remove('pending');
      updateDisabled();
    }
  }
}

async function refresh() {
  if (!session || polling || sending) return;
  if (demoMode) {
    const mixes = session.account.mixes;
    if (!mixes.includes(selectedMix)) selectedMix = mixes[0] ?? null;
    $('mix-select').replaceChildren(...mixes.map(id => {
      const option = document.createElement('option'); option.value = id; option.textContent = `Mix ${id} · 演示`; return option;
    }));
    $('mix-select').value = selectedMix ?? '';
    $('mix-heading').textContent = '耳返界面 · 演示预览';
    connection(false);
    const locked = new Set(session.account.lockedChannels ?? []);
    const demoChannels = Array.from({ length: 30 }, (_, i) => {
      const channel = i + 1, partner = channel % 2 ? channel + 1 : channel - 1;
      const linked = LINKED_PAIR_SET.has(channel);
      const isLocked = locked.has(channel) || (linked && locked.has(partner));
      return { mix: selectedMix, channel, name: getUcChannelInfo(channel).name, level: demoLevels.get(`${selectedMix}:${channel}`) ?? 0,
        unit: 'percent', source: 'demo', writable: selectedMix !== null && !isLocked, locked: isLocked, linked };
    });
    render(demoChannels); return;
  }
  polling = true;
  const currentEpoch = epoch;


  try {
    const status = await api('/api/status');
    if (currentEpoch !== epoch) return;
    connection(status.connected && !needsCheck);
    if (!status.connected || needsCheck) return;
    const { mixes } = await api('/api/mixes');
    if (currentEpoch !== epoch) return;
    const ids = mixes.map(m => m.id);
    if (!ids.includes(selectedMix)) {
      selectedMix = ids[0] ?? null;
      cards.clear();
      $('channels').replaceChildren();
    }
    const oldValues = Array.from($('mix-select').options).map(o => o.value).join(',');
    if (oldValues !== ids.join(',')) {
      $('mix-select').replaceChildren(...mixes.map(m => {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = m.name || `混音 ${m.id}`;
        return o;
      }));
    }
    $('mix-select').value = selectedMix ?? '';
    const mix = mixes.find(m => m.id === selectedMix);
    $('mix-heading').textContent = mix?.name ? `${mix.name} · 我的耳返` : '我的耳返';
    if (!mix) {
      $('notice').textContent = '账号尚未分配可用的混音通道，请联系调音师。';
      return;
    }
    $('notice').textContent = mix.writable ? '' : '这一路混音受调音台保护，当前为只读模式。';
    const { channels } = await api(`/api/mixes/${selectedMix}/channels`);
    const enhancedChannels = channels.map(c => ({
      ...c,
      linked: isChannelLinked(c, channels)
    }));
    if (currentEpoch === epoch && !sending) render(enhancedChannels);
  } catch (error) {
    if (currentEpoch === epoch) {
      connection(false);
      $('notice').textContent = error.message;
    }
  } finally {
    polling = false;
  }
}

// 通道自定义弹窗管理
let currentEditingChannel = null;
let selectedColor = '#22c55e';
let selectedIcon = 'mic';

function initModal() {
  const colorGrid = $('color-picker-grid');
  if (colorGrid) {
    colorGrid.replaceChildren();
    for (const c of UC_COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-dot-btn';
      btn.style.backgroundColor = c.value;
      btn.style.setProperty('--dot-text', c.text);
      btn.title = c.name;
      btn.dataset.color = c.value;
      btn.dataset.text = c.text;
      btn.addEventListener('click', () => {
        selectedColor = c.value;
        updateSelectedColor();
      });
      colorGrid.appendChild(btn);
    }
  }

  const iconGrid = $('icon-picker-grid');
  if (iconGrid) {
    iconGrid.replaceChildren();
    for (const ic of UC_ICONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-choice-btn';
      btn.dataset.icon = ic.id;
      btn.innerHTML = `${ICONS[ic.id]}<span>${ic.label}</span>`;
      btn.addEventListener('click', () => {
        selectedIcon = ic.id;
        updateSelectedIcon();
      });
      iconGrid.appendChild(btn);
    }
  }

  $('modal-close')?.addEventListener('click', () => $('edit-channel-modal')?.close());
  $('modal-cancel')?.addEventListener('click', () => $('edit-channel-modal')?.close());
  $('edit-channel-modal')?.addEventListener('click', (e) => {
    if (e.target === $('edit-channel-modal')) $('edit-channel-modal').close();
  });

  $('edit-channel-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentEditingChannel) return;
    const newName = $('edit-channel-name').value.trim();
    if (!newName) return;

    const colorObj = UC_COLORS.find(c => c.value === selectedColor);
    const textColor = colorObj?.text || (isLightColor(selectedColor) ? '#000000' : '#ffffff');
    const updated = {
      name: newName,
      color: selectedColor,
      icon: selectedIcon,
      textColor
    };

    const card = cards.get(currentEditingChannel);
    const updates = { [currentEditingChannel]: updated };
    if (card && card.isStereo) {
      updates[currentEditingChannel + 1] = {
        ...updated,
        name: updated.name.endsWith(' L') ? updated.name.replace(/ L$/, ' R') : updated.name
      };
    }

    try {
      await api('/api/channels/config', {
        method: 'POST',
        body: JSON.stringify(updates)
      });
      Object.assign(channelConfig, updates);

      // 即时刷新 DOM
      if (card) {
        updateCard(card, card.data);
      }
      $('edit-channel-modal').close();
      $('notice').textContent = `通道 ${card && card.isStereo ? `${currentEditingChannel}/${currentEditingChannel + 1}` : currentEditingChannel} 设置已保存！`;
      filter();
    } catch (err) {
      alert('保存通道设置失败: ' + err.message);
    }
  });
}

function updateSelectedColor() {
  document.querySelectorAll('.color-dot-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === selectedColor);
  });
}

function updateSelectedIcon() {
  document.querySelectorAll('.icon-choice-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.icon === selectedIcon);
  });
}

function openEditModal(channelNum) {
  currentEditingChannel = channelNum;
  const card = cards.get(channelNum);
  const isStereo = card ? card.isStereo : false;
  const cfg = channelConfig[String(channelNum)] || channelConfig[channelNum] || {};
  const info = getUcChannelInfo(channelNum, cfg.name);

  $('modal-channel-title').textContent = isStereo
    ? `通道 ${channelNum}/${channelNum + 1} 设置 (立体声)`
    : `通道 ${channelNum} 设置 (名称/颜色/图标)`;
  $('edit-channel-name').value = info.name;
  selectedColor = info.color.startsWith('#') ? info.color : '#475569';
  selectedIcon = info.icon || 'mic';
  updateSelectedColor();
  updateSelectedIcon();
  $('edit-channel-modal')?.showModal();
}

async function enter(result) {
  demoMode = false; demoLevels.clear();
  epoch++;
  session = result;
  needsCheck = false;
  online = false;
  selectedMix = null;
  document.body.classList.remove('is-login');
  if ($('loading')) $('loading').hidden = true;
  if ($('login-panel')) $('login-panel').hidden = true;
  if ($('mix-panel')) $('mix-panel').hidden = false;
  if ($('account-label')) $('account-label').textContent = `${result.account.name} · 专属混音通道`;
  await loadChannelConfig();
  connection(false);
  await refresh();
}

// 登录表单提交
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('login-button').disabled = true;
  $('login-error').textContent = '';
  try {
    await enter(await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        account: $('account').value.trim(),
        pin: $('pin').value.trim()
      })
    }));
    $('pin').value = '';
  } catch (e) {
    $('login-error').textContent = e.message;
  } finally {
    $('login-button').disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); showLogin(); }
  catch (e) { $('notice').textContent = e.message; }
});

$('mix-select').addEventListener('change', () => {
  epoch++;
  selectedMix = Number($('mix-select').value);
  cards.clear();
  $('channels').replaceChildren();
  void refresh();
});

$('search').addEventListener('input', filter);

// 分类标签切换
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    filter();
  });
});

$('toggle-pin')?.addEventListener('click', () => {
  const p = $('pin');
  p.type = p.type === 'password' ? 'text' : 'password';
});

$('toggle-demo').addEventListener('click', () => {
  if (sending) return;
  epoch++; demoMode = !demoMode; needsCheck = false; selectedMix = null;
  cards.clear(); $('channels').replaceChildren();
  $('notice').textContent = demoMode ? '仅在此页面预览。刷新或重新登录后，演示自动关闭。' : '已退出演示，正在读取真实设备。';
  connection(false); void refresh();
});

$('reconnect').addEventListener('click', async () => {
  $('reconnect').disabled = true;
  $('notice').textContent = '正在重新连接调音台…';
  try {
    await api('/api/reconnect', { method: 'POST' });
    needsCheck = false;
    await refresh();
  } catch (e) {
    $('notice').textContent = e.message;
  } finally {
    $('reconnect').disabled = false;
  }
});

setInterval(() => { if (!document.hidden) void refresh(); }, 1800);

// 配色主题管理 (深色 UC 工业风 / 浅色工程风)
function initTheme() {
  const saved = localStorage.getItem('cecp_theme') || 'dark';
  applyTheme(saved);
  $('theme-switch-login')?.addEventListener('click', toggleTheme);
  $('theme-switch-nav')?.addEventListener('click', toggleTheme);
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  try { localStorage.setItem('cecp_theme', isLight ? 'light' : 'dark'); } catch {}
  
  const text = isLight ? '🌙 切换深色' : '☀️ 切换浅色';
  const loginBtn = $('theme-switch-login');
  if (loginBtn) {
    loginBtn.textContent = text;
    loginBtn.title = isLight ? '点击切换为 UC 官方深黑工业风' : '点击切换为实色浅色工程风';
  }
  const navBtn = $('theme-switch-nav');
  if (navBtn) {
    navBtn.textContent = text;
    navBtn.title = isLight ? '点击切换为 UC 官方深黑工业风' : '点击切换为实色浅色工程风';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

(async () => {
  initTheme();
  initModal();
  await loadChannelConfig();
  try { await enter(await api('/api/session')); }
  catch { showLogin(); }
})();
