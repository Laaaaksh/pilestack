#!/bin/sh
set -e

pnpm exec prisma migrate deploy
exec pnpm exec next start
