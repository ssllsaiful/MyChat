from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    # Add any extra fields here if needed
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    
    def __str__(self):
        return self.username
