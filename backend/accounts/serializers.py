from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email')

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
        return user


from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import exceptions

class CustomTokenObtainSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['email'] = serializers.EmailField()

    def validate(self, attrs):
        # The parent method validates username and password
        data = super().validate(attrs)
        
        # Now validate email matches the authenticated user
        if self.user.email != attrs.get('email'):
            raise exceptions.AuthenticationFailed(
                'Email does not match the registered email for this username.',
                'invalid_credentials',
            )
            
        return data
