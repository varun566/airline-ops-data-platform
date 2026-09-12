.PHONY: up demo unit integration lint transform logs down

up:
	docker compose up --build -d

demo:
	docker compose run --rm demo

unit:
	docker compose run --rm --no-deps tests pytest -q tests/unit

integration:
	docker compose run --rm --no-deps -e RUN_INTEGRATION=1 tests pytest -q tests/integration

lint:
	docker compose run --rm --no-deps tests ruff check .

transform:
	docker compose run --rm transform

logs:
	docker compose logs -f --tail=50 consumer demo

down:
	docker compose down
