# Agent Mail Workflow Examples

This directory contains practical examples of multi-agent coordination using Agent Mail and Beads.

## What's Here

### Workflow Examples (`workflows/`)

Real-world coordination patterns demonstrated with executable scripts:

1. **`01-basic-collaboration.sh`** - Two agents working on related tasks
2. **`02-parallel-work.sh`** - Multiple agents working simultaneously without conflicts
3. **`03-handoff-pattern.sh`** - One agent passing work to another
4. **`04-conflict-resolution.sh`** - Handling file reservation conflicts gracefully
5. **`05-full-sprint.sh`** - Complete development sprint with planning, execution, and review

### Best Practices (`best-practices.md`)

Patterns that work well and anti-patterns to avoid.

## Running Examples

Each example is a self-contained bash script that demonstrates a specific pattern:

```bash
cd examples/workflows
bash 01-basic-collaboration.sh
```

All examples use a temporary test database so they won't affect your real Agent Mail data.

## Learning Path

**New to Agent Mail?**
1. Start with `01-basic-collaboration.sh` to understand the fundamentals
2. Read `best-practices.md` to learn patterns and anti-patterns
3. Try `02-parallel-work.sh` to see how agents avoid conflicts
4. Experiment with `03-handoff-pattern.sh` for task handoffs
5. Study `05-full-sprint.sh` for a complete workflow

**Already using Agent Mail?**
- Jump to `best-practices.md` for optimization tips
- Check `04-conflict-resolution.sh` for handling edge cases
- Use `05-full-sprint.sh` as a template for your workflows

## Real-World Context

These examples are based on actual multi-agent development sessions:

- **PaleStar + DashboardBuilder**: Building the Beads dashboard (foundation + UI tasks in parallel)
- **Cross-project coordination**: Multiple agents working across different repositories
- **Conflict prevention**: File reservations preventing merge conflicts

## Key Concepts Demonstrated

- **Agent Registration**: Creating and managing agent identities
- **File Reservations**: Exclusive and shared locks with TTL
- **Threading**: Organizing messages by task ID
- **Search**: Finding relevant messages with FTS5
- **Acknowledgments**: Confirming message receipt
- **Status Tracking**: Using `am-whoami` to check agent state

## Next Steps

After exploring these examples:

1. **Try it yourself**: Register an agent in your project
2. **Coordinate with teammates**: Share Agent Mail database across team
3. **Integrate with Beads**: Use task IDs as thread IDs
4. **Scale up**: Add more agents as needed (no coordination overhead)

## Documentation

- **Main README**: `../README.md` - Full jat documentation
- **Installation**: Run `../install.sh` to set up Agent Mail
- **API Reference**: Each `am-*` tool has `--help` flag

## Contributing Examples

Have a workflow pattern to share? Add it to `workflows/` with:
1. Descriptive filename (`NN-pattern-name.sh`)
2. Header comment explaining the pattern
3. Inline comments for key steps
4. Self-contained (uses test database)
5. Demonstrates one clear concept

## License

Same as jat (see ../LICENSE)
