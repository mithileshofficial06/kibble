# 120 simulated agents

`make sim` runs 120 made-up agents for 25 windows through the real contracts, with the same demand for every policy ([`KibbleSim.t.sol`](../contracts/test/bench/KibbleSim.t.sol)). It's deterministic, so you get the same numbers.

- **Agents:** about 60 in 100 healthy, 20 with thin margins, 20 whose input price jumps above their sale price partway (29 of the 120). 15 have their key stolen; the thief overbuys from a colluding supplier.
- **Kibble, no human:** nobody ever steps in.
- **Fixed, tight:** a limit 25% above launch demand. **Fixed, roomy:** enough for peak demand. Both have loss alerts and a human who freezes the agent after its second bad window.

| | Kibble, no human | Fixed, tight | Fixed, roomy |
|---|---|---|---|
| Sales served | **18,382** | 16,544 | 18,464 |
| Sales turned away | **2,636** | 4,474 | 2,554 |
| Stolen by attackers (tUSD8) | **7.55** | 15.45 | 23.00 |
| Lost after a price jump | 4.08 | **3.78** | 6.54 |
| Owners' net (tUSD8) | **901.89** | 796.78 | 883.98 |
| Bad or hijacked agents stopped (paused or frozen) | 6 of 44* | 39 of 44* | 39 of 44* |
| Bad or hijacked agents on Watch or Braked | 16 | 0 | 0 |
| Customers the agent key couldn't refund | 0 | 0 | 0 |

\* 29 turn bad and 15 are hijacked. An agent can be both, so 44 is the most it could be.

## How to read it

- **Growth without the exposure.** Kibble served nearly as much as the roomy fixed limit (99.6%) with a third of the theft, and 11% more than the tight one.
- **Kibble didn't win everything.** The tight fixed limit with an attentive human lost slightly less after price jumps.
- **Kibble rarely ended "Paused" here**, and that matters if you expect a pause. These thieves ask for small amounts (0.25). An attempt that keeps the window under the activity floor (0.5) is refused but isn't a strike, so the agent keeps refusing without pausing. An attacker asking for 0.5 is paused within seconds ([attacks](attacks.md)).
- **The fixed policies get a human; Kibble doesn't.** With no human, the fixed sides keep paying.

The agents, prices, demand and human are all invented. This shows how the rules behave, not how any real business would do.
