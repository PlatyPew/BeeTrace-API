FROM alpine:latest
RUN mkdir -p /opt/honeypy
WORKDIR /opt/honeypy
RUN apk add --no-cache python build-base python-dev
COPY src/requirements.txt ./
RUN python -m ensurepip && \
	pip install --upgrade pip setuptools && \
	pip install -r requirements.txt && \
	rm -r /usr/lib/python*/ensurepip /root/.cache
COPY src/ ./
ARG service
RUN cp etc/profiles/$service etc/services.cfg
ENTRYPOINT ["./Honey.py", "-d"]
