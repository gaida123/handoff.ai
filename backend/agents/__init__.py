# Agents are imported lazily inside run_agents.py AFTER asyncio.set_event_loop()
# is called for the bureau thread.  Do NOT add module-level Agent imports here —
# Agent.__init__ calls asyncio.get_event_loop() and will crash in Python 3.10+
# background threads that have no default event loop.
