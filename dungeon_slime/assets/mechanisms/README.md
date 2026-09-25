# Pressure plate

`pressure-plate.svg` is an original vector sprite with two transparent 128×128 frames:

- Left: unpressed, bronze circular socket and raised coral pad.
- Right: pressed, recessed teal pad and green status lights.

The round silhouette and floor socket distinguish the button from the raised square stone. Both carry a star to show their relationship. A green ring remains visible around a stone holding the button down. The renderer keeps a circular fallback when the sprite cannot load.

The hazard passage keeps its inset frame in both states. Sliding metal covers shut over the hazard while the pressure plate is held down, displaying a green safe indicator. Releasing the plate reopens the covers and restores the hazard immediately in collision logic.
