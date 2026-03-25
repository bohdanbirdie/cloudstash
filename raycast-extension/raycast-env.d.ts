/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Server URL - Cloudstash server URL */
  "serverUrl": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `save-link` command */
  export type SaveLink = ExtensionPreferences & {}
  /** Preferences accessible in the `save-clipboard-url` command */
  export type SaveClipboardUrl = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `save-link` command */
  export type SaveLink = {
  /** URL */
  "url": string
}
  /** Arguments passed to the `save-clipboard-url` command */
  export type SaveClipboardUrl = {}
}

