FROM python:3.11.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    JAVA_HOME=/opt/java SPARK_LOCAL_IP=127.0.0.1 \
    PYSPARK_PYTHON=python SPARK_JARS_DIR=/opt/spark-jars

RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-17-jre-headless ca-certificates curl procps \
    && ln -s /usr/lib/jvm/java-17-openjdk-$(dpkg --print-architecture) /opt/java \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
# Match Hadoop bundled with Spark 3.5.7. Resolve drivers at build time, not job startup.
RUN mkdir -p /opt/spark-jars && \
    curl -fsSL --retry 5 https://repo.maven.apache.org/maven2/org/apache/hadoop/hadoop-aws/3.3.4/hadoop-aws-3.3.4.jar \
      -o /opt/spark-jars/hadoop-aws.jar && \
    curl -fsSL --retry 5 https://repo.maven.apache.org/maven2/com/amazonaws/aws-java-sdk-bundle/1.12.262/aws-java-sdk-bundle-1.12.262.jar \
      -o /opt/spark-jars/aws-java-sdk-bundle.jar && \
    curl -fsSL --retry 5 https://repo.maven.apache.org/maven2/org/postgresql/postgresql/42.7.8/postgresql-42.7.8.jar \
      -o /opt/spark-jars/postgresql.jar
RUN useradd --create-home --uid 10001 airline && chown airline:airline /app
COPY --chown=airline:airline . .
RUN pip install --no-cache-dir --no-deps .
USER airline
CMD ["python", "-m", "airline_ops.demo"]
