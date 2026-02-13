#!/usr/bin/env node

/**
 * Vinsa CLI — Executable Entry Point
 * This is what runs when users type `vinsa` in their terminal.
 */

import 'dotenv/config';
import { program } from '../src/index.js';

program.parse(process.argv);
