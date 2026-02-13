#!/usr/bin/env node

/**
 * Vinsa CLI — Executable Entry Point
 * This is what runs when users type `vinsa` in their terminal.
 */

// Suppress Node.js internal deprecation warnings (e.g., punycode DEP0040)
// that come from transitive dependencies — not actionable by end users.
process.noDeprecation = true;

import 'dotenv/config';
import { program } from '../src/index.js';

program.parse(process.argv);
