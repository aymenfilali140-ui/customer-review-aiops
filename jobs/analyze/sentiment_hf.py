from typing import List, Dict, Any
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification


class SentimentClassifier:
    """
    Uses a star-rating sentiment model and maps:
      1-2 -> Negative
      3   -> Neutral
      4-5 -> Positive
    """
    def __init__(self, model_name: str = "nlptown/bert-base-multilingual-uncased-sentiment"):
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name).to(self.device)
        self.model.eval()

    @staticmethod
    def _stars_to_label(stars_1_to_5: int) -> str:
        if stars_1_to_5 <= 2:
            return "Negative"
        if stars_1_to_5 == 3:
            return "Neutral"
        return "Positive"

    def predict_labels(self, texts: List[str]) -> List[Dict[str, Any]]:
        """
        Returns list of dicts: {"label": Positive|Neutral|Negative, "stars": int, "confidence": float}
        Confidence here is max softmax probability (rough proxy).
        """
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
            idx = int(torch.argmax(p).item())  # 0..4
            stars = idx + 1
            label = self._stars_to_label(stars)
            confidence = float(p[idx].item())
            results.append({"label": label, "stars": stars, "confidence": confidence})

        return results
