# ─── NBA Formula Brute-Forcer v3 ──────────────────────────────────────────── #

CC      = gcc
NVCC    = nvcc
CFLAGS  = -O3 -march=native -ffast-math -fopenmp -Wall -Wextra -std=c11
NVFLAGS = -O3 --use_fast_math
ifdef GPU_ARCH
  NVFLAGS += -arch=$(GPU_ARCH)
else
  NVFLAGS += -arch=sm_89
endif
LDFLAGS = -lm -fopenmp -lcudart

OBJ     = obj

C_SRCS  = main.c data.c eval.c search.c
CU_SRCS = eval_kernel.cu gpu_search.cu
C_OBJS  = $(C_SRCS:%.c=$(OBJ)/%.o)
CU_OBJS = $(CU_SRCS:%.cu=$(OBJ)/%.o)
TARGET  = bruteforce

# ─── Default: GPU build ───────────────────────────────────────────────────── #
all: $(OBJ) $(TARGET)

$(TARGET): $(C_OBJS) $(CU_OBJS)
	$(CC) -o $@ $^ $(LDFLAGS)

$(OBJ)/%.o: %.c | $(OBJ)
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJ)/%.o: %.cu | $(OBJ)
	$(NVCC) $(NVFLAGS) -c $< -o $@

$(OBJ):
	mkdir -p $(OBJ)

# ─── CPU-only build ───────────────────────────────────────────────────────── #
cpu: $(OBJ) $(C_OBJS) $(OBJ)/gpu_stub.o
	$(CC) -o bruteforce_cpu $(C_OBJS) $(OBJ)/gpu_stub.o -lm -fopenmp

$(OBJ)/gpu_stub.o: gpu_stub.c | $(OBJ)
	$(CC) $(CFLAGS) -c gpu_stub.c -o $@

gpu_stub.c:
	@printf '#include "gpu_search.h"\n#include "search.h"\n'                        > $@
	@printf 'GpuInfo gpu_query(void){return (GpuInfo){.available=0};}\n'            >> $@
	@printf 'GpuConfig gpu_default_config(void){return (GpuConfig){512*1024,256,1};}\n' >> $@
	@printf 'BestResult search_gpu(const Database*db,const Database*dv,const SearchConfig*s,const GpuConfig*g,TopK*tk){return search_cpu(db,dv,s,tk);}\n' >> $@

# ─── Utilities ────────────────────────────────────────────────────────────── #
check_cuda:
	@which nvcc >/dev/null 2>&1 \
	    && nvcc --version | head -1 \
	    || echo "nvcc NOT found — use 'make cpu'"
	@nvidia-smi --query-gpu=name,driver_version,compute_cap \
	    --format=csv,noheader 2>/dev/null || true

%.bin: %.json
	python3 json_to_bin.py $< $@

clean:
	rm -rf $(OBJ) $(TARGET) bruteforce_cpu gpu_stub.c

.PHONY: all cpu clean check_cuda