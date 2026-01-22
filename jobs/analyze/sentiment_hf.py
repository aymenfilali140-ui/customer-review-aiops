from typing import List, Dict, Any
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification


class SentimentClassifier:
    """
    Supports:
      - 5-class star models: 1-2 -> Negative, 3 -> Neutral, 4-5 -> Positive
      - 3-class sentiment models: NEG/NEU/POS (label-name based)
    Returns: {"label": Positive|Neutral|Negative, "stars": int|None, "confidence": float}
    """

    def __init__(self, model_name: str = "tabularisai/multilingual-sentiment-analysis"):
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name).to(self.device)
        self.model.eval()

        self.model_name = model_name
        self.num_labels = int(getattr(self.model.config, "num_labels", 0) or 0)
        self.id2label = {}
        if hasattr(self.model.config, "id2label") and isinstance(self.model.config.id2label, dict):
            # HF sometimes stores keys as strings
            self.id2label = {int(k): str(v) for k, v in self.model.config.id2label.items()}

    @staticmethod
    def _stars_to_label(stars_1_to_5: int) -> str:
        if stars_1_to_5 <= 2:
            return "Negative"
        if stars_1_to_5 == 3:
            return "Neutral"
        return "Positive"

    @staticmethod
    def _labelname_to_label(label_name: str) -> str:
        """
        Normalize common HF label names into Positive|Neutral|Negative.
        """
        s = (label_name or "").strip().lower()

        # common patterns
        if "neg" in s or s in {"negative", "label_0"} and "pos" not in s:
            return "Negative"
        if "neu" in s or "neutral" in s:
            return "Neutral"
        if "pos" in s or "positive" in s:
            return "Positive"

        # fallback: try star-like labels "1 star", "2 stars", etc.
        for n in ["1", "2", "3", "4", "5"]:
            if n in s:
                return SentimentClassifier._stars_to_label(int(n))

        # last resort
        return "Neutral"

    def predict_labels(self, texts: List[str]) -> List[Dict[str, Any]]:
        if not texts:
            return []

        enc = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=256,
            return_tensors="pt",
        ).to(self.device)

        with torch.no_grad():
            logits = self.model(**enc).logits
            probs = torch.softmax(logits, dim=-1)

        results: List[Dict[str, Any]] = []
        for i in range(len(texts)):
            p = probs[i]
            idx = int(torch.argmax(p).item())
            confidence = float(p[idx].item())

            # Decide mapping strategy
            stars = None
            if self.num_labels == 5:
                stars = idx + 1
                label = self._stars_to_label(stars)
            else:
                label_name = self.id2label.get(idx, f"label_{idx}")
                label = self._labelname_to_label(label_name)

            results.append({"label": label, "stars": stars, "confidence": confidence})

        return results
