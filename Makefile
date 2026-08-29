.PHONY: build run test lint tidy clean

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
