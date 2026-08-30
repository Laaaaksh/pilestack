.PHONY: build run test lint tidy clean demo

build:
	pnpm install --frozen-lockfile
	pnpm exec prisma generate
	pnpm build

run:
	pnpm dev

test:
	pnpm test

lint:
	pnpm lint
	pnpm typecheck

tidy:
	pnpm exec prisma format

clean:
	rm -rf .next node_modules coverage

# Boots the real app, seeds a real GitHub PR stack, records the README demo,
# and converts it to docs/assets/demo.{mp4,gif}. Needs a .env pointed at a
# real GitHub OAuth App + GitHub App (see scripts/record-demo/README.md) —
# `npm run login` below is a one-time interactive step (sign in + approve
# GitHub's OAuth consent screen in a real browser window) that can't be
# scripted around, since Pilestack has no dev-mode auth bypass.
demo:
	pnpm db:deploy
	pnpm db:generate
	pnpm dev & echo $$! > .demo-server.pid
	@echo "Waiting for http://localhost:3000 ..."
	@until curl -sf http://localhost:3000 > /dev/null 2>&1; do sleep 1; done
	cd scripts/record-demo && npm install && npx playwright install chromium
	cd scripts/record-demo && npm run seed
	cd scripts/record-demo && npm run login
	cd scripts/record-demo && npm run record
	cd scripts/record-demo && npm run convert
	@kill `cat .demo-server.pid` 2>/dev/null || true
	@rm -f .demo-server.pid
