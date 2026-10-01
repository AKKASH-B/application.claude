"""Run once after deploying (or whenever indexes change):  python init_indexes.py

Vercel's serverless runtime may not fire FastAPI startup events, so the unique/TTL indexes and the
admin-claim backfill are created here instead. Safe to run repeatedly. Needs MONGO_URL / DB_NAME set.
"""
import asyncio

import server


async def main():
    await server._startup_indexes()
    await server._backfill_admin_claims()
    print("Indexes ready.")


if __name__ == "__main__":
    asyncio.run(main())
