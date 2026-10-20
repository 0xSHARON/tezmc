"""
Base Agent Abstract Interface.
All rule-based, Q-learning, and hierarchical agents inherit from this interface.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class BaseAgent(ABC):
    def __init__(self, name: str = "BaseAgent"):
        self.name = name

    @abstractmethod
    def act(self, observation: Any) -> str:
        """
        Takes a GameObservation and returns an action string:
        ('pass', 'up', 'down', 'left', 'right', 'a', 'b', 'start', 'select')
        """
        pass

    def learn(self, transition: Dict[str, Any]) -> None:
        """
        Optional learning update step from an environment transition tuple:
        {'state': ..., 'action': ..., 'reward': ..., 'next_state': ..., 'done': ...}
        """
        pass

    def save(self, filepath: str) -> None:
        """
        Persists policy or model weights to disk.
        """
        pass

    def load(self, filepath: str) -> None:
        """
        Loads policy or model weights from disk.
        """
        pass
